import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricFact, calculateEnrichedMetrics } from '../scripts/enriched-metrics.mjs';

test('calcula SLA, resposta, trabalho, avaliação e cobertura', () => {
    const facts = {
        a: buildMetricFact({ id: 'a', creation_date: '2026-08-25T10:00:00Z', first_reply_date: '2026-08-25T12:00:00Z', work_time_seconds: 3600, sla: { initialization: { accomplished: true }, deadline: { accomplished: true } }, evaluation: { grade: '5' }, department: { id: 'd', name: 'TI' } }),
        b: buildMetricFact({ id: 'b', creation_date: '2026-08-25T10:00:00Z', first_reply_date: '2026-08-25T14:00:00Z', work_time_seconds: 7200, sla: { initialization: { accomplished: false }, deadline: { accomplished: true } }, evaluation: { grade: '3' }, department: { id: 'd', name: 'TI' } })
    };
    const metrics = calculateEnrichedMetrics(facts, 4);
    assert.equal(metrics.coverage.rate, 50); assert.equal(metrics.sla.initialization.rate, 50); assert.equal(metrics.first_response.mean_hours, 3); assert.equal(metrics.first_response.median_hours, 3); assert.equal(metrics.work_time.mean_hours, 1.5); assert.equal(metrics.evaluation.mean_grade, 4);
    const department = metrics.breakdowns.departments[0];
    assert.equal(department.volume, 2); assert.equal(department.backlog, 2); assert.equal(department.sla_deadline_rate, 100); assert.equal(department.sla_initialization_rate, 50); assert.equal(department.mean_first_response_hours, 3); assert.equal(department.total_work_hours, 3);
});

test('não inventa valores sem amostra elegível', () => {
    const metrics = calculateEnrichedMetrics({ a: { id: 'a' } }, 10);
    assert.equal(metrics.sla.initialization.rate, null); assert.equal(metrics.first_response.mean_hours, null); assert.equal(metrics.evaluation.mean_grade, null);
});

test('calcula chamados sem movimentação somente quando há data real', () => {
    const metrics = calculateEnrichedMetrics({
        a: buildMetricFact({ id: 'a', protocol: 10, subject: 'Parado', situation: { description: 'Em análise', apply_date: '2026-08-24T08:00:00Z' }, department: { name: 'TI' } }),
        b: buildMetricFact({ id: 'b', situation: { apply_date: '2026-08-25T10:00:00Z' } }),
        c: buildMetricFact({ id: 'c', end_date: '2026-08-25T11:00:00Z', situation: { apply_date: '2026-08-20T10:00:00Z' } }),
        d: buildMetricFact({ id: 'd' })
    }, 4, '2026-08-25T12:00:00Z');
    assert.equal(metrics.staleness.eligible, 2);
    assert.deepEqual(metrics.staleness.thresholds, { over_4h: 1, over_8h: 1, over_24h: 1, over_72h: 0 });
    assert.equal(metrics.staleness.records[0].subject, 'Parado');
    assert.equal(metrics.staleness.records[0].idle_hours, 28);
});
