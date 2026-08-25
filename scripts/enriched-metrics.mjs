const validDate = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

export function buildMetricFact(ticket = {}) {
    return { id: ticket.id, protocol: ticket.protocol, subject: ticket.subject, priority: ticket.priority, creation_date: ticket.creation_date, end_date: ticket.end_date, first_reply_date: ticket.first_reply_date, last_movement_date: ticket.situation?.apply_date, status: ticket.situation?.description, work_time_seconds: ticket.work_time_seconds, reopened: ticket.reopened === true, sla_initialization: ticket.sla?.initialization?.accomplished ?? null, sla_deadline: ticket.sla?.deadline?.accomplished ?? null, evaluation_grade: ticket.evaluation?.grade ?? null, department: ticket.department, category: ticket.category, responsible_agent: ticket.responsible_agent };
}

function stalenessMetrics(facts, generatedAt) {
    const now = validDate(generatedAt) || new Date();
    const records = facts.filter(item => !item.end_date).map(item => {
        const movement = validDate(item.last_movement_date);
        if (!movement || movement > now) return null;
        return { id: item.id, protocol: item.protocol ?? null, subject: item.subject || 'Sem título', priority: item.priority ?? null, status: item.status || 'Não informado', last_movement_date: movement.toISOString(), idle_hours: round((now - movement) / 3600000, 1), responsible_agent: item.responsible_agent?.name || 'Não informado', category: item.category?.name || 'Não informado', department: item.department?.name || 'Não informado' };
    }).filter(Boolean).sort((a, b) => b.idle_hours - a.idle_hours);
    const countOver = hours => records.filter(item => item.idle_hours > hours).length;
    return { eligible: records.length, thresholds: { over_4h: countOver(4), over_8h: countOver(8), over_24h: countOver(24), over_72h: countOver(72) }, records };
}

function slaMetric(facts, field) {
    const eligible = facts.filter(item => typeof item[field] === 'boolean');
    const compliant = eligible.filter(item => item[field]).length;
    return { eligible: eligible.length, compliant, rate: eligible.length ? round(compliant / eligible.length * 100) : null };
}

function groupMetrics(facts, field) {
    const groups = new Map();
    facts.forEach(item => {
        const entity = item[field]; if (!entity?.id && !entity?.name) return;
        const key = entity.id || entity.name;
        const group = groups.get(key) || { id: entity.id || null, name: entity.name || 'Não informado', volume: 0, concluded: 0, backlog: 0, reopened: 0, sla: [], initialization: [], resolution: [], response: [], work: [] };
        group.volume++;
        if (item.end_date) group.concluded++; else group.backlog++;
        if (item.reopened) group.reopened++;
        if (typeof item.sla_deadline === 'boolean') group.sla.push(item.sla_deadline);
        if (typeof item.sla_initialization === 'boolean') group.initialization.push(item.sla_initialization);
        const created = validDate(item.creation_date); const ended = validDate(item.end_date); const replied = validDate(item.first_reply_date);
        if (created && ended && ended >= created) group.resolution.push((ended - created) / 3600000);
        if (created && replied && replied >= created) group.response.push((replied - created) / 3600000);
        const worked = Number(item.work_time_seconds); if (Number.isFinite(worked) && worked >= 0) group.work.push(worked / 3600);
        groups.set(key, group);
    });
    return [...groups.values()].map(group => ({
        id: group.id, name: group.name, volume: group.volume, concluded: group.concluded, backlog: group.backlog, reopened: group.reopened,
        completion_rate: group.volume ? round(group.concluded / group.volume * 100) : null,
        reopen_rate: group.volume ? round(group.reopened / group.volume * 100) : null,
        sla_deadline_rate: group.sla.length ? round(group.sla.filter(Boolean).length / group.sla.length * 100) : null,
        sla_initialization_rate: group.initialization.length ? round(group.initialization.filter(Boolean).length / group.initialization.length * 100) : null,
        mean_resolution_hours: group.resolution.length ? round(average(group.resolution)) : null,
        mean_first_response_hours: group.response.length ? round(average(group.response)) : null,
        total_work_hours: round(group.work.reduce((sum, value) => sum + value, 0)),
        mean_work_hours: group.work.length ? round(average(group.work)) : null
    })).sort((a, b) => b.volume - a.volume);
}

export function calculateEnrichedMetrics(metricState = {}, totalListed = 0, generatedAt = new Date().toISOString()) {
    const facts = Object.values(metricState).filter(item => item?.id);
    const responseHours = facts.map(item => { const created = validDate(item.creation_date); const replied = validDate(item.first_reply_date); return created && replied && replied >= created ? (replied - created) / 3600000 : null; }).filter(value => value != null);
    const workHours = facts.map(item => Number(item.work_time_seconds)).filter(value => Number.isFinite(value) && value >= 0).map(value => value / 3600);
    const grades = facts.map(item => Number(item.evaluation_grade)).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
    return {
        generated_at: generatedAt,
        coverage: { enriched: facts.length, total: totalListed, rate: totalListed ? round(facts.length / totalListed * 100) : 0 },
        sla: { initialization: slaMetric(facts, 'sla_initialization'), deadline: slaMetric(facts, 'sla_deadline') },
        first_response: { count: responseHours.length, mean_hours: responseHours.length ? round(average(responseHours)) : null, median_hours: responseHours.length ? round(median(responseHours)) : null },
        work_time: { count: workHours.length, total_hours: round(workHours.reduce((sum, value) => sum + value, 0)), mean_hours: workHours.length ? round(average(workHours)) : null },
        evaluation: { count: grades.length, mean_grade: grades.length ? round(average(grades)) : null },
        staleness: stalenessMetrics(facts, generatedAt),
        breakdowns: { departments: groupMetrics(facts, 'department'), categories: groupMetrics(facts, 'category'), operators: groupMetrics(facts, 'responsible_agent') }
    };
}
