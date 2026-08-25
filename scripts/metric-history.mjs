const round = value => Number(Number(value || 0).toFixed(2));
const dateKey = value => new Date(value).toISOString().slice(0, 10);

export function updateMetricHistory(history = [], metrics = {}, tickets = [], generatedAt = new Date().toISOString(), retentionDays = 365) {
    const day = dateKey(generatedAt);
    const point = {
        date: day, collected_at: generatedAt, listed: tickets.length,
        backlog: tickets.filter(item => !item.end_date).length,
        enriched: metrics.coverage?.enriched || 0,
        sla_deadline_rate: metrics.sla?.deadline?.rate ?? null,
        reopen_rate: tickets.length ? round(tickets.filter(item => item.reopened === true).length / tickets.length * 100) : null,
        stale_over_72h: metrics.staleness?.thresholds?.over_72h || 0
    };
    const merged = [...history.filter(item => item?.date && item.date !== day), point].sort((a, b) => a.date.localeCompare(b.date));
    return merged.slice(-Math.max(1, retentionDays));
}

export function calculateMetricTrends(history = []) {
    const points = [...history].sort((a, b) => a.date.localeCompare(b.date)); const recent = points.slice(-3);
    const continuousBacklogGrowth = recent.length === 3 && recent.every((item, index) => index === 0 || item.backlog > recent[index - 1].backlog);
    const last = points.at(-1); const previous = points.at(-2);
    return { daily: points, backlog: { current: last?.backlog ?? null, previous: previous?.backlog ?? null, delta: last && previous ? last.backlog - previous.backlog : null, continuous_growth_3d: continuousBacklogGrowth } };
}

export function appendTrendAlerts(alerts = {}, trends = {}, config = {}) {
    const active = [...(alerts.active || [])]; const rule = config.rules?.continuous_backlog_growth;
    if (rule?.enabled && trends.backlog?.continuous_growth_3d) active.push({ id: 'continuous_backlog_growth', severity: 'warning', title: 'Backlog em crescimento contínuo', message: `O backlog total cresceu por ${Number(rule.consecutive_days || 3)} dias consecutivos.`, value: trends.backlog.current, target: null });
    return { ...alerts, active, active_count: active.length };
}
