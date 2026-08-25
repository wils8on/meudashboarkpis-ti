import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricFact, calculateEnrichedMetrics } from '../scripts/enriched-metrics.mjs';

test('calcula SLA, resposta, trabalho, avaliação e cobertura', () => {
    const facts = {
        a: buildMetricFact({ id: 'a', creation_date: '2026-08-25T10:00:00Z', first_reply_date: '2026-08-25T12:00:00Z', work_time_seconds: 3600, sla: { initialization: { accomplished: true }, deadline: { accomplished: true } }, evaluation: { grade: '5' }, department: { id: 'd', name: 'TI' } }),
        b: buildMetricFact({ id: 'b', creation_date: '2026-08-25T10:00:00Z', first_reply_date: '2026-08-25T14:00:00Z', work_time_seconds: 7200, sla: { initialization: { accomplished: false }, deadline: { accomplished: true } }, evaluation: { grade: '3' }, department: { id: 'd', name: 'TI' } })
    };
    const metrics = calculateEnrichedMetrics(facts, 4);
    assert.equal(metrics.coverage.rate, 50); assert.equal(metrics.sla.initialization.rate, 50); assert.equal(metrics.first_response.mean_hours, 3); assert.equal(metrics.first_response.median_hours, 3); assert.equal(metrics.work_time.mean_hours, 1.5); assert.equal(metrics.evaluation.mean_grade, 4); assert.equal(metrics.breakdowns.departments[0].volume, 2);
});

test('não inventa valores sem amostra elegível', () => {
    const metrics = calculateEnrichedMetrics({ a: { id: 'a' } }, 10);
    assert.equal(metrics.sla.initialization.rate, null); assert.equal(metrics.first_response.mean_hours, null); assert.equal(metrics.evaluation.mean_grade, null);
});
