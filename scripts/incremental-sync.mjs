import { createHash } from 'node:crypto';
import { createIncrementalStore } from './incremental-firestore.mjs';
import { normalizeTicketDetail } from './ticket-normalizer.mjs';
import { buildSnapshot, diffRelevantState } from './ticket-diff.mjs';
import { extractDimensions } from './ticket-dimensions.mjs';
import { inspectDetailQuality, inspectListingQuality } from './ticket-quality.mjs';

const DETAIL_LIMIT = 20;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

export function selectDetailCandidates(tickets, state = {}, limit = DETAIL_LIMIT) {
    const classified = tickets.filter(ticket => ticket?.id).map(ticket => {
        const previous = state[ticket.id];
        const fingerprint = listingFingerprint(ticket);
        return { ticket, fingerprint, previous, isNew: !previous, changed: Boolean(previous && previous.list_hash !== fingerprint), unenriched: !previous?.detail_hash };
    });
    return classified
        .filter(item => item.isNew || item.changed || item.unenriched)
        .sort((a, b) => Number(b.changed) - Number(a.changed) || Number(b.isNew) - Number(a.isNew))
        .slice(0, Math.max(0, limit));
}

async function fetchDetail(ticketId, token) {
    const url = new URL('https://api.tomticket.com/v2.0/ticket/detail');
    url.searchParams.set('ticket_id', String(ticketId));
    url.searchParams.set('show_stopwatch', '1');
    url.searchParams.set('show_staggered_tickets', '1');
    url.searchParams.set('show_tags', '1');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Detalhe TomTicket HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.error === true || !payload?.data) throw new Error('Detalhe TomTicket sem objeto data.');
    return payload.data;
}

export async function syncIncrementalTickets(tickets, { token, firebaseSecret, detailLimit = Number(process.env.TOMTICKET_DETAIL_LIMIT || DETAIL_LIMIT) } = {}) {
    const started = new Date();
    const runId = started.toISOString().replace(/[.:]/g, '-');
    const store = await createIncrementalStore(firebaseSecret);
    const state = await store.loadState();
    const candidates = selectDetailCandidates(tickets, state, detailLimit);
    const counters = { snapshots: 0, errors: 0, details: 0 };
    const quality = inspectListingQuality(tickets, started.toISOString());
    const dimensionsWritten = new Set();

    for (const candidate of candidates) {
        try {
            const detail = await fetchDetail(candidate.ticket.id, token);
            const normalized = normalizeTicketDetail(detail);
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
    const run = {
        id: runId, started_at: started.toISOString(), finished_at: finished.toISOString(), duration_ms: finished - started,
        listed: tickets.length, new_tickets: candidates.filter(item => item.isNew).length,
        changed_tickets: candidates.filter(item => item.changed).length, detail_requests: counters.details,
        snapshots: counters.snapshots, dimensions: dimensionsWritten.size, errors: counters.errors,
        quality_issues: quality.total_issues, success: counters.errors === 0
    };
    await store.saveQualityReport(runId, quality);
    await store.saveRun(run);
    return run;
}
