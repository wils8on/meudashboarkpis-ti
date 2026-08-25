const finalStatus = value => /finaliz|fechad|conclu|encerrad/i.test(String(value || ''));
const validDate = value => value == null || value === '' || !Number.isNaN(new Date(value).getTime());

function addIssue(report, code, ticket, detail = null) {
    report.counts[code] = (report.counts[code] || 0) + 1;
    if (report.samples.length < 50) report.samples.push({ code, ticket_id: ticket?.id || null, protocol: ticket?.protocol ?? null, detail });
}

export function inspectListingQuality(tickets = [], generatedAt = new Date().toISOString()) {
    const report = { generated_at: generatedAt, records: tickets.length, total_issues: 0, counts: {}, samples: [] };
    const protocols = new Set();
    tickets.forEach(ticket => {
        if (!ticket?.id) addIssue(report, 'missing_ticket_id', ticket);
        if (ticket?.protocol == null) addIssue(report, 'missing_protocol', ticket);
        else if (protocols.has(String(ticket.protocol))) addIssue(report, 'duplicate_protocol', ticket);
        else protocols.add(String(ticket.protocol));
        if (!validDate(ticket?.creation_date)) addIssue(report, 'invalid_creation_date', ticket);
        if (!validDate(ticket?.end_date)) addIssue(report, 'invalid_end_date', ticket);
        const status = ticket?.status?.description || ticket?.situation?.description;
        if (!status) addIssue(report, 'missing_status', ticket);
        if (finalStatus(status) && !ticket?.end_date) addIssue(report, 'closed_without_end_date', ticket);
        if (ticket?.priority != null && ![1, 2, 3, 4].includes(Number(ticket.priority))) addIssue(report, 'unknown_priority', ticket, String(ticket.priority));
        if (ticket?.sla?.deadline?.accomplished == null) addIssue(report, 'missing_sla_deadline', ticket);
    });
    report.total_issues = Object.values(report.counts).reduce((sum, count) => sum + count, 0);
    return report;
}

export function inspectDetailQuality(ticket, report) {
    if (!ticket) return report;
    if (!ticket.department?.id) addIssue(report, 'missing_department', ticket);
    if (!ticket.category?.id) addIssue(report, 'missing_category', ticket);
    if (!ticket.responsible_agent?.id) addIssue(report, 'missing_responsible_agent', ticket);
    if (!ticket.customer?.id) addIssue(report, 'missing_customer', ticket);
    if (ticket.sla?.initialization?.accomplished == null) addIssue(report, 'missing_sla_initialization', ticket);
    report.total_issues = Object.values(report.counts).reduce((sum, count) => sum + count, 0);
    return report;
}

export function summarizeQuality(report = {}) {
    const criticalCodes = new Set(['missing_ticket_id', 'missing_protocol', 'duplicate_protocol', 'invalid_creation_date', 'invalid_end_date', 'missing_status', 'closed_without_end_date', 'unknown_priority']);
    const labels = { missing_ticket_id: 'Chamado sem identificador', missing_protocol: 'Protocolo ausente', duplicate_protocol: 'Protocolo duplicado', invalid_creation_date: 'Data de criação inválida', invalid_end_date: 'Data de conclusão inválida', missing_status: 'Status ausente', closed_without_end_date: 'Finalizado sem data de conclusão', unknown_priority: 'Prioridade desconhecida', missing_sla_deadline: 'SLA de deadline ausente', missing_department: 'Departamento ausente', missing_category: 'Categoria ausente', missing_responsible_agent: 'Atendente ausente', missing_customer: 'Cliente ausente', missing_sla_initialization: 'SLA de inicialização ausente' };
    const issues = Object.entries(report.counts || {}).filter(([, count]) => Number(count) > 0).map(([code, count]) => ({ code, label: labels[code] || code, count: Number(count), severity: criticalCodes.has(code) ? 'critical' : 'warning' })).sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'critical' ? -1 : 1));
    const critical = issues.filter(item => item.severity === 'critical').reduce((sum, item) => sum + item.count, 0);
    const warnings = issues.filter(item => item.severity === 'warning').reduce((sum, item) => sum + item.count, 0);
    return { generated_at: report.generated_at || null, records: report.records || 0, total_issues: critical + warnings, critical, warnings, status: critical ? 'critical' : warnings ? 'attention' : 'healthy', issues };
}
