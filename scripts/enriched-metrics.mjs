const validDate = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

export function buildMetricFact(ticket = {}) {
    return { id: ticket.id, priority: ticket.priority, creation_date: ticket.creation_date, end_date: ticket.end_date, first_reply_date: ticket.first_reply_date, work_time_seconds: ticket.work_time_seconds, reopened: ticket.reopened === true, sla_initialization: ticket.sla?.initialization?.accomplished ?? null, sla_deadline: ticket.sla?.deadline?.accomplished ?? null, evaluation_grade: ticket.evaluation?.grade ?? null, department: ticket.department, category: ticket.category, responsible_agent: ticket.responsible_agent };
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
        const group = groups.get(key) || { id: entity.id || null, name: entity.name || 'Não informado', volume: 0, concluded: 0, reopened: 0, sla: [] };
        group.volume++; if (item.end_date) group.concluded++; if (item.reopened) group.reopened++; if (typeof item.sla_deadline === 'boolean') group.sla.push(item.sla_deadline); groups.set(key, group);
    });
    return [...groups.values()].map(group => ({ id: group.id, name: group.name, volume: group.volume, concluded: group.concluded, reopened: group.reopened, sla_deadline_rate: group.sla.length ? round(group.sla.filter(Boolean).length / group.sla.length * 100) : null })).sort((a, b) => b.volume - a.volume);
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
        breakdowns: { departments: groupMetrics(facts, 'department'), categories: groupMetrics(facts, 'category'), operators: groupMetrics(facts, 'responsible_agent') }
    };
}
