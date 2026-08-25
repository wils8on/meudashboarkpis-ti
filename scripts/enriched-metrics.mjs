const validDate = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

export function buildMetricFact(ticket = {}) {
    return { schema_version: 2, id: ticket.id, protocol: ticket.protocol, subject: ticket.subject, priority: ticket.priority, creation_date: ticket.creation_date, end_date: ticket.end_date, first_reply_date: ticket.first_reply_date, last_movement_date: ticket.situation?.apply_date, status: ticket.situation?.description, interaction_count: Number.isInteger(ticket.interaction_count) && ticket.interaction_count >= 0 ? ticket.interaction_count : null, work_time_seconds: ticket.work_time_seconds, reopened: ticket.reopened === true, sla_initialization: ticket.sla?.initialization?.accomplished ?? null, sla_deadline: ticket.sla?.deadline?.accomplished ?? null, evaluation_grade: ticket.evaluation?.grade ?? null, evaluation_problem_solved: ticket.evaluation?.problem_solved ?? null, department: ticket.department, category: ticket.category, responsible_agent: ticket.responsible_agent };
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

function operationalAlerts(facts, metrics, config = {}) {
    const rules = config.rules || {}; const alerts = [];
    const add = (id, severity, title, message, value, target) => alerts.push({ id, severity, title, message, value, target });
    const sla = rules.sla_deadline;
    if (sla?.enabled && metrics.sla.deadline.eligible >= Number(sla.minimum_sample || 0) && metrics.sla.deadline.rate < Number(sla.minimum_rate)) add('sla_deadline', 'critical', 'SLA de deadline abaixo da meta', `${metrics.sla.deadline.rate}% de cumprimento em ${metrics.sla.deadline.eligible} chamados elegíveis.`, metrics.sla.deadline.rate, sla.minimum_rate);
    const backlog = facts.filter(item => !item.end_date).length; const backlogRule = rules.enriched_backlog;
    if (backlogRule?.enabled && metrics.coverage.rate >= Number(backlogRule.minimum_coverage_rate || 0) && backlog > Number(backlogRule.maximum_count)) add('enriched_backlog', 'warning', 'Backlog enriquecido acima do limite', `${backlog} chamados abertos na amostra enriquecida.`, backlog, backlogRule.maximum_count);
    const reopenRule = rules.reopen_rate; const reopenRate = facts.length ? round(facts.filter(item => item.reopened).length / facts.length * 100) : 0;
    if (reopenRule?.enabled && facts.length >= Number(reopenRule.minimum_sample || 0) && reopenRate > Number(reopenRule.maximum_rate)) add('reopen_rate', 'warning', 'Taxa de reabertura elevada', `${reopenRate}% dos chamados enriquecidos foram reabertos.`, reopenRate, reopenRule.maximum_rate);
    const staleRule = rules.critical_staleness; const staleHours = Number(staleRule?.hours || 72); const staleCount = metrics.staleness.records.filter(item => item.idle_hours > staleHours).length;
    if (staleRule?.enabled && staleCount > Number(staleRule.maximum_count || 0)) add('critical_staleness', 'critical', 'Chamados críticos sem movimentação', `${staleCount} chamado(s) estão parados há mais de ${staleHours / 24} dia(s).`, staleCount, staleRule.maximum_count);
    const anomalyRule = rules.department_volume_anomaly;
    if (anomalyRule?.enabled && metrics.coverage.rate >= Number(anomalyRule.minimum_coverage_rate || 0)) {
        metrics.breakdowns.departments.filter(item => item.volume_previous_30d >= Number(anomalyRule.minimum_previous_volume || 0) && item.volume_growth_30d > Number(anomalyRule.maximum_growth_rate || 0)).forEach(item => add(`department_anomaly_${item.id || item.name}`, 'warning', `Aumento anormal em ${item.name}`, `O volume cresceu ${item.volume_growth_30d}% nos últimos 30 dias.`, item.volume_growth_30d, anomalyRule.maximum_growth_rate));
    }
    return { active: alerts, active_count: alerts.length, config_version: config.version || null, prepared_rules: config.prepared_rules || [] };
}

function slaMetric(facts, field) {
    const eligible = facts.filter(item => typeof item[field] === 'boolean');
    const compliant = eligible.filter(item => item[field]).length;
    return { eligible: eligible.length, compliant, rate: eligible.length ? round(compliant / eligible.length * 100) : null };
}

function groupMetrics(facts, field, generatedAt = new Date().toISOString()) {
    const reference = validDate(generatedAt) || new Date(); const currentStart = new Date(reference); currentStart.setUTCDate(currentStart.getUTCDate() - 30); const previousStart = new Date(reference); previousStart.setUTCDate(previousStart.getUTCDate() - 60);
    const groups = new Map();
    facts.forEach(item => {
        const entity = item[field]; if (!entity?.id && !entity?.name) return;
        const key = entity.id || entity.name;
        const group = groups.get(key) || { id: entity.id || null, name: entity.name || 'Não informado', volume: 0, current30: 0, previous30: 0, concluded: 0, backlog: 0, reopened: 0, sla: [], initialization: [], resolution: [], response: [], work: [], workElapsed: [], interactions: [], grades: [] };
        group.volume++;
        if (item.end_date) group.concluded++; else group.backlog++;
        if (item.reopened) group.reopened++;
        if (typeof item.sla_deadline === 'boolean') group.sla.push(item.sla_deadline);
        if (typeof item.sla_initialization === 'boolean') group.initialization.push(item.sla_initialization);
        const created = validDate(item.creation_date); const ended = validDate(item.end_date); const replied = validDate(item.first_reply_date);
        if (created && created <= reference && created >= currentStart) group.current30++; else if (created && created < currentStart && created >= previousStart) group.previous30++;
        if (created && ended && ended >= created) group.resolution.push((ended - created) / 3600000);
        if (created && replied && replied >= created) group.response.push((replied - created) / 3600000);
        const worked = Number(item.work_time_seconds); if (Number.isFinite(worked) && worked >= 0) { group.work.push(worked / 3600); if (created && ended && ended > created) group.workElapsed.push({ worked: worked / 3600, elapsed: (ended - created) / 3600000 }); }
        if (Number.isInteger(item.interaction_count) && item.interaction_count >= 0) group.interactions.push(item.interaction_count);
        const grade = Number(item.evaluation_grade); if (Number.isFinite(grade) && grade >= 1 && grade <= 5) group.grades.push(grade);
        groups.set(key, group);
    });
    return [...groups.values()].map(group => ({
        id: group.id, name: group.name, volume: group.volume, concluded: group.concluded, backlog: group.backlog, reopened: group.reopened,
        completion_rate: group.volume ? round(group.concluded / group.volume * 100) : null,
        volume_current_30d: group.current30, volume_previous_30d: group.previous30, volume_growth_30d: group.previous30 ? round((group.current30 - group.previous30) / group.previous30 * 100) : null,
        reopen_rate: group.volume ? round(group.reopened / group.volume * 100) : null,
        sla_deadline_rate: group.sla.length ? round(group.sla.filter(Boolean).length / group.sla.length * 100) : null,
        sla_initialization_rate: group.initialization.length ? round(group.initialization.filter(Boolean).length / group.initialization.length * 100) : null,
        mean_resolution_hours: group.resolution.length ? round(average(group.resolution)) : null,
        mean_first_response_hours: group.response.length ? round(average(group.response)) : null,
        total_work_hours: round(group.work.reduce((sum, value) => sum + value, 0)),
        mean_work_hours: group.work.length ? round(average(group.work)) : null,
        work_elapsed_rate: group.workElapsed.length ? round(group.workElapsed.reduce((sum, item) => sum + item.worked, 0) / group.workElapsed.reduce((sum, item) => sum + item.elapsed, 0) * 100) : null,
        mean_interactions: group.interactions.length ? round(average(group.interactions)) : null,
        evaluation_count: group.grades.length, mean_evaluation: group.grades.length ? round(average(group.grades)) : null
    })).sort((a, b) => b.volume - a.volume);
}

function priorityMetrics(facts, generatedAt) {
    const labels = { 1: 'Baixa', 2: 'Normal', 3: 'Alta', 4: 'Urgente' };
    const withDimension = facts.filter(item => item.priority != null).map(item => ({ ...item, priority_dimension: { id: String(item.priority), name: labels[Number(item.priority)] || `Prioridade ${item.priority}` } }));
    return groupMetrics(withDimension, 'priority_dimension', generatedAt);
}

export function calculateEnrichedMetrics(metricState = {}, totalListed = 0, generatedAt = new Date().toISOString(), alertConfig = {}) {
    const facts = Object.values(metricState).filter(item => item?.id);
    const responseHours = facts.map(item => { const created = validDate(item.creation_date); const replied = validDate(item.first_reply_date); return created && replied && replied >= created ? (replied - created) / 3600000 : null; }).filter(value => value != null);
    const workHours = facts.map(item => Number(item.work_time_seconds)).filter(value => Number.isFinite(value) && value >= 0).map(value => value / 3600);
    const workElapsed = facts.map(item => { const created = validDate(item.creation_date); const ended = validDate(item.end_date); const worked = Number(item.work_time_seconds); return created && ended && ended > created && Number.isFinite(worked) && worked >= 0 ? { worked: worked / 3600, elapsed: (ended - created) / 3600000 } : null; }).filter(Boolean);
    const grades = facts.map(item => Number(item.evaluation_grade)).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
    const interactionCounts = facts.map(item => item.interaction_count).filter(value => Number.isInteger(value) && value >= 0);
    const concluded = facts.filter(item => item.end_date);
    const evaluatedConcluded = concluded.filter(item => { const grade = Number(item.evaluation_grade); return Number.isFinite(grade) && grade >= 1 && grade <= 5; });
    const solved = facts.filter(item => typeof item.evaluation_problem_solved === 'boolean');
    const metrics = {
        generated_at: generatedAt,
        coverage: { enriched: facts.length, total: totalListed, rate: totalListed ? round(facts.length / totalListed * 100) : 0 },
        sla: { initialization: slaMetric(facts, 'sla_initialization'), deadline: slaMetric(facts, 'sla_deadline') },
        first_response: { count: responseHours.length, mean_hours: responseHours.length ? round(average(responseHours)) : null, median_hours: responseHours.length ? round(median(responseHours)) : null },
        work_time: { count: workHours.length, total_hours: round(workHours.reduce((sum, value) => sum + value, 0)), mean_hours: workHours.length ? round(average(workHours)) : null, elapsed_sample: workElapsed.length, elapsed_hours: round(workElapsed.reduce((sum, item) => sum + item.elapsed, 0)), effective_ratio: workElapsed.length ? round(workElapsed.reduce((sum, item) => sum + item.worked, 0) / workElapsed.reduce((sum, item) => sum + item.elapsed, 0) * 100) : null, cost_estimation_ready: workHours.length > 0 },
        interactions: { count: interactionCounts.length, total: interactionCounts.reduce((sum, value) => sum + value, 0), mean: interactionCounts.length ? round(average(interactionCounts)) : null, high_touch: interactionCounts.filter(value => value > 10).length },
        evaluation: { count: grades.length, mean_grade: grades.length ? round(average(grades)) : null, response_rate: concluded.length ? round(evaluatedConcluded.length / concluded.length * 100) : null, eligible_concluded: concluded.length, problem_solved_count: solved.length, problem_solved_rate: solved.length ? round(solved.filter(item => item.evaluation_problem_solved).length / solved.length * 100) : null },
        staleness: stalenessMetrics(facts, generatedAt),
        breakdowns: { departments: groupMetrics(facts, 'department', generatedAt), categories: groupMetrics(facts, 'category', generatedAt), operators: groupMetrics(facts, 'responsible_agent', generatedAt), priorities: priorityMetrics(facts, generatedAt) }
    };
    metrics.alerts = operationalAlerts(facts, metrics, alertConfig);
    return metrics;
}
