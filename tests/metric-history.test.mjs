import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTrendAlerts, calculateMetricTrends, updateMetricHistory } from '../scripts/metric-history.mjs';

test('mantém um ponto por dia e substitui a coleta do mesmo dia', () => {
    const metrics = { coverage: { enriched: 2 }, sla: { deadline: { rate: 90 } }, staleness: { thresholds: { over_72h: 1 } } };
    let history = updateMetricHistory([], metrics, [{ end_date: null }, { end_date: '2026-08-01' }], '2026-08-25T10:00:00Z');
    history = updateMetricHistory(history, metrics, [{ end_date: null }, { end_date: null }], '2026-08-25T12:00:00Z');
    assert.equal(history.length, 1); assert.equal(history[0].backlog, 2); assert.equal(history[0].collected_at, '2026-08-25T12:00:00Z');
});

test('detecta crescimento do backlog somente em três dias consecutivos', () => {
    const trends = calculateMetricTrends([{ date: '2026-08-23', backlog: 5 }, { date: '2026-08-24', backlog: 6 }, { date: '2026-08-25', backlog: 8 }]);
    assert.equal(trends.backlog.continuous_growth_3d, true); assert.equal(trends.backlog.delta, 2);
    const alerts = appendTrendAlerts({ active: [], active_count: 0 }, trends, { rules: { continuous_backlog_growth: { enabled: true, consecutive_days: 3 } } });
    assert.equal(alerts.active[0].id, 'continuous_backlog_growth');
});
