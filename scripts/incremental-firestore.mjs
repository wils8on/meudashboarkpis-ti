import { getAccessToken } from './private-firestore.mjs';

const API_ROOT = 'https://firestore.googleapis.com/v1';

function stringField(value) { return { stringValue: String(value ?? '') }; }
function integerField(value) { return { integerValue: String(Number(value) || 0) }; }
function booleanField(value) { return { booleanValue: value === true }; }
function timestampField(value) { return value ? { timestampValue: new Date(value).toISOString() } : { nullValue: null }; }

export async function createIncrementalStore(secretValue) {
    if (!secretValue) throw new Error('O segredo FIREBASE_SERVICE_ACCOUNT não está configurado.');
    const serviceAccount = JSON.parse(secretValue);
    const projectId = serviceAccount.project_id;
    if (!projectId) throw new Error('Credencial Firebase sem project_id.');
    const token = await getAccessToken(serviceAccount);
    const documentUrl = (collection, id) => `${API_ROOT}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;

    async function get(collection, id) {
        const response = await fetch(documentUrl(collection, id), { headers: { Authorization: `Bearer ${token}` } });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Falha ao ler ${collection}/${id}: HTTP ${response.status}`);
        return response.json();
    }

    async function put(collection, id, fields) {
        const response = await fetch(documentUrl(collection, id), {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
        });
        if (!response.ok) throw new Error(`Falha ao gravar ${collection}/${id}: HTTP ${response.status}`);
    }

    return {
        async loadState() {
            const document = await get('tomticket_sync_state', 'index');
            try { return JSON.parse(document?.fields?.payload?.stringValue || '{}'); }
            catch { return {}; }
        },
        saveState(state, updatedAt) {
            return put('tomticket_sync_state', 'index', {
                payload: stringField(JSON.stringify(state)),
                ticket_count: integerField(Object.keys(state).length),
                updated_at: timestampField(updatedAt)
            });
        },
        async loadMetricState() {
            const document = await get('tomticket_sync_state', 'metrics');
            try { return JSON.parse(document?.fields?.payload?.stringValue || '{}'); }
            catch { return {}; }
        },
        saveMetricState(state, updatedAt) {
            return put('tomticket_sync_state', 'metrics', { payload: stringField(JSON.stringify(state)), enriched_records: integerField(Object.keys(state).length), updated_at: timestampField(updatedAt) });
        },
        async loadMetricHistory() {
            const document = await get('tomticket_sync_state', 'metric_history');
            try { return JSON.parse(document?.fields?.payload?.stringValue || '[]'); }
            catch { return []; }
        },
        saveMetricHistory(history, updatedAt) {
            return put('tomticket_sync_state', 'metric_history', { payload: stringField(JSON.stringify(history)), days: integerField(history.length), updated_at: timestampField(updatedAt) });
        },
        saveMetrics(metrics) {
            return put('tomticket_private', 'metrics', { payload: stringField(JSON.stringify(metrics)), generated_at: timestampField(metrics.generated_at), enriched_records: integerField(metrics.coverage?.enriched), total_records: integerField(metrics.coverage?.total), coverage_rate: { doubleValue: Number(metrics.coverage?.rate || 0) } });
        },
        async loadTicket(id) {
            const document = await get('tomticket_tickets', id);
            try { return JSON.parse(document?.fields?.payload?.stringValue || 'null'); }
            catch { return null; }
        },
        saveTicket(ticket) {
            return put('tomticket_tickets', ticket.id, {
                payload: stringField(JSON.stringify(ticket)),
                protocol: integerField(ticket.protocol),
                status: stringField(ticket.situation?.description),
                priority: integerField(ticket.priority),
                creation_date: timestampField(ticket.creation_date),
                end_date: timestampField(ticket.end_date),
                department_id: stringField(ticket.department?.id),
                category_id: stringField(ticket.category?.id),
                responsible_agent_id: stringField(ticket.responsible_agent?.id),
                reopened: booleanField(ticket.reopened),
                collected_at: timestampField(ticket.collected_at)
            });
        },
        saveSnapshot(snapshot) {
            const id = `${snapshot.ticket_id}_${snapshot.state_hash.slice(0, 16)}`;
            return put('tomticket_ticket_snapshots', id, {
                payload: stringField(JSON.stringify(snapshot)),
                ticket_id: stringField(snapshot.ticket_id),
                protocol: integerField(snapshot.protocol),
                status: stringField(snapshot.situation?.description),
                priority: integerField(snapshot.priority),
                collected_at: timestampField(snapshot.collected_at),
                state_hash: stringField(snapshot.state_hash)
            });
        },
        saveRun(run) {
            return put('tomticket_sync_runs', run.id, {
                started_at: timestampField(run.started_at),
                finished_at: timestampField(run.finished_at),
                duration_ms: integerField(run.duration_ms),
                listed: integerField(run.listed),
                new_tickets: integerField(run.new_tickets),
                changed_tickets: integerField(run.changed_tickets),
                detail_requests: integerField(run.detail_requests),
                retries: integerField(run.retries),
                snapshots: integerField(run.snapshots),
                dimensions: integerField(run.dimensions),
                enriched_records: integerField(run.enriched_records),
                errors: integerField(run.errors),
                success: booleanField(run.success),
                quality_issues: integerField(run.quality_issues)
            });
        },
        saveDimension(dimension, updatedAt) {
            return put(`tomticket_dim_${dimension.type}`, dimension.id, {
                payload: stringField(JSON.stringify(dimension)),
                name: stringField(dimension.name),
                updated_at: timestampField(updatedAt)
            });
        },
        saveQualityReport(runId, report) {
            return put('tomticket_quality_reports', runId, {
                payload: stringField(JSON.stringify(report)),
                generated_at: timestampField(report.generated_at),
                records: integerField(report.records),
                total_issues: integerField(report.total_issues)
            });
        }
    };
}
