import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createIncrementalStore } from './incremental-firestore.mjs';
import { normalizeTicketDetail } from './ticket-normalizer.mjs';
import { buildSnapshot, diffRelevantState } from './ticket-diff.mjs';
import { extractDimensions } from './ticket-dimensions.mjs';
import { inspectDetailQuality, inspectListingQuality, summarizeQuality } from './ticket-quality.mjs';
import { buildMetricFact, calculateEnrichedMetrics } from './enriched-metrics.mjs';
import { appendTrendAlerts, calculateMetricTrends, updateMetricHistory } from './metric-history.mjs';

const DETAIL_LIMIT = 20;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function loadAlertConfig() { try { return JSON.parse(await readFile(new URL('../config/operational-alerts.json', import.meta.url), 'utf8')); } catch { return {}; } }

export function listingFingerprint(ticket = {}) {
    const relevant = {
        priority: ticket.priority ?? null,
        reopened: ticket.reopened === true,
        end_date: ticket.end_date || null,
        status: ticket.status?.description || ticket.situation?.description || null,
        sla_deadline: ticket.sla?.deadline?.accomplished ?? null
    };
    return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

export function selectDetailCandidates(tickets, state = {}, limit = DETAIL_LIMIT, metricState = {}) {
    const classified = tickets.filter(ticket => ticket?.id).map(ticket => {
        const previous = state[ticket.id];
        const fingerprint = listingFingerprint(ticket);
        return { ticket, fingerprint, previous, isNew: !previous, changed: Boolean(previous && previous.list_hash !== fingerprint), unenriched: !previous?.detail_hash || metricState[ticket.id]?.schema_version !== 2 };
    });
    return classified
        .filter(item => item.isNew || item.changed || item.unenriched)
        .sort((a, b) => Number(b.changed) - Number(a.changed) || Number(b.isNew) - Number(a.isNew))
        .slice(0, Math.max(0, limit));
}

export function summarizeListingChanges(tickets, state = {}) {
    return tickets.filter(ticket => ticket?.id).reduce((summary, ticket) => {
        const previous = state[ticket.id];
        if (!previous) summary.new_tickets++;
        else if (previous.list_hash !== listingFingerprint(ticket)) summary.changed_tickets++;
        return summary;
    }, { new_tickets: 0, changed_tickets: 0 });
}

export async function fetchDetailWithRetry(ticketId, token, { fetchImpl = fetch, maxAttempts = 3, wait = delay } = {}) {
    const url = new URL('https://api.tomticket.com/v2.0/ticket/detail');
    url.searchParams.set('ticket_id', String(ticketId));
    url.searchParams.set('show_stopwatch', '1');
    url.searchParams.set('show_staggered_tickets', '1');
    url.searchParams.set('show_tags', '1');
    let lastError; const attempts = Math.max(1, Number(maxAttempts) || 1);
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let response;
        try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); }
        catch (error) {
            lastError = new Error(`Falha de rede ao consultar detalhe TomTicket: ${error.message}`);
            if (attempt === attempts) break;
            console.warn(`Falha temporária de rede no detalhe TomTicket; nova tentativa ${attempt + 1}/${attempts}.`);
            await wait(Math.min(1000 * 2 ** (attempt - 1), 10000)); continue;
        }
        if (response.ok) {
            const payload = await response.json();
            if (payload?.error === true || !payload?.data) throw new Error('Detalhe TomTicket sem objeto data.');
            return { data: payload.data, retries: attempt - 1 };
        }
        lastError = new Error(`Detalhe TomTicket HTTP ${response.status}.`);
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === attempts) break;
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 10000) : Math.min(1000 * 2 ** (attempt - 1), 10000);
        console.warn(`Detalhe TomTicket temporariamente indisponível (HTTP ${response.status}); nova tentativa ${attempt + 1}/${attempts}.`);
        await wait(waitMs);
    }
    throw lastError;
}

export async function syncIncrementalTickets(tickets, { token, firebaseSecret, detailLimit = Number(process.env.TOMTICKET_DETAIL_LIMIT || DETAIL_LIMIT) } = {}) {
    const started = new Date();
    const runId = started.toISOString().replace(/[.:]/g, '-');
    const store = await createIncrementalStore(firebaseSecret);
    const state = await store.loadState();
    const metricState = await store.loadMetricState();
    const listingChanges = summarizeListingChanges(tickets, state);
    const candidates = selectDetailCandidates(tickets, state, detailLimit, metricState);
    const counters = { snapshots: 0, errors: 0, details: 0, retries: 0 };
    const quality = inspectListingQuality(tickets, started.toISOString());
    const dimensionsWritten = new Set();

    for (const candidate of candidates) {
        try {
            const detailResult = await fetchDetailWithRetry(candidate.ticket.id, token);
            const detail = detailResult.data; counters.retries += detailResult.retries;
            const normalized = normalizeTicketDetail(detail);
            metricState[normalized.id] = buildMetricFact(normalized);
            inspectDetailQuality(normalized, quality);
            const previous = await store.loadTicket(normalized.id);
            const diff = diffRelevantState(previous, normalized);
            await store.saveTicket(normalized);
            const snapshot = buildSnapshot(normalized, diff, normalized.collected_at);
            if (snapshot) { await store.saveSnapshot(snapshot); counters.snapshots++; }
            const dimensions = extractDimensions(normalized).filter(item => {
                const key = `${item.type}/${item.id}`;
                if (dimensionsWritten.has(key)) return false;
                dimensionsWritten.add(key);
                return true;
            });
            await Promise.all(dimensions.map(item => store.saveDimension(item, normalized.collected_at)));
            state[normalized.id] = { list_hash: candidate.fingerprint, detail_hash: diff.hash, enriched_at: normalized.collected_at };
            counters.details++;
        } catch (error) {
            counters.errors++;
            console.warn(`Falha ao enriquecer um chamado: ${error.message}`);
        }
        await delay(300);
    }

    tickets.filter(ticket => ticket?.id).forEach(ticket => {
        const current = state[ticket.id] || {};
        state[ticket.id] = { ...current, list_hash: listingFingerprint(ticket), seen_at: new Date().toISOString() };
    });
    const finished = new Date();
    await store.saveState(state, finished.toISOString());
    await store.saveMetricState(metricState, finished.toISOString());
    const alertConfig = await loadAlertConfig();
    const metrics = calculateEnrichedMetrics(metricState, tickets.length, finished.toISOString(), alertConfig);
    const history = updateMetricHistory(await store.loadMetricHistory(), metrics, tickets, finished.toISOString());
    metrics.trends = calculateMetricTrends(history);
    metrics.alerts = appendTrendAlerts(metrics.alerts, metrics.trends, alertConfig);
    await store.saveMetricHistory(history, finished.toISOString());
    const run = {
        id: runId, started_at: started.toISOString(), finished_at: finished.toISOString(), duration_ms: finished - started,
        listed: tickets.length, new_tickets: listingChanges.new_tickets,
        changed_tickets: listingChanges.changed_tickets, detail_requests: counters.details, retries: counters.retries,
        snapshots: counters.snapshots, dimensions: dimensionsWritten.size, enriched_records: metrics.coverage.enriched, errors: counters.errors,
        quality_issues: quality.total_issues, success: counters.errors === 0
    };
    metrics.sync = run;
    metrics.data_quality = summarizeQuality(quality);
    await store.saveMetrics(metrics);
    await store.saveQualityReport(runId, quality);
    await store.saveRun(run);
    return run;
}
