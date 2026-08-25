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
