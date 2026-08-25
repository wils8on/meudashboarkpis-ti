import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricFact, calculateEnrichedMetrics } from '../scripts/enriched-metrics.mjs';

test('calcula SLA, resposta, trabalho, avaliação e cobertura', () => {
    const facts = {
        a: buildMetricFact({ id: 'a', priority: 3, creation_date: '2026-08-25T10:00:00Z', end_date: '2026-08-25T15:00:00Z', first_reply_date: '2026-08-25T12:00:00Z', interaction_count: 4, work_time_seconds: 3600, sla: { initialization: { accomplished: true }, deadline: { accomplished: true } }, evaluation: { grade: '5', problem_solved: true }, department: { id: 'd', name: 'TI' } }),
        b: buildMetricFact({ id: 'b', priority: 3, creation_date: '2026-08-25T10:00:00Z', end_date: '2026-08-25T16:00:00Z', first_reply_date: '2026-08-25T14:00:00Z', interaction_count: 8, work_time_seconds: 7200, sla: { initialization: { accomplished: false }, deadline: { accomplished: true } }, evaluation: { grade: '3', problem_solved: false }, department: { id: 'd', name: 'TI' } })
    };
    const metrics = calculateEnrichedMetrics(facts, 4);
    assert.equal(metrics.coverage.rate, 50); assert.equal(metrics.sla.initialization.rate, 50); assert.equal(metrics.first_response.mean_hours, 3); assert.equal(metrics.first_response.median_hours, 3); assert.equal(metrics.work_time.mean_hours, 1.5); assert.equal(metrics.work_time.elapsed_hours, 11); assert.equal(metrics.work_time.effective_ratio, 27.27); assert.equal(metrics.evaluation.mean_grade, 4);
    const department = metrics.breakdowns.departments[0];
    assert.equal(department.volume, 2); assert.equal(department.concluded, 2); assert.equal(department.backlog, 0); assert.equal(department.sla_deadline_rate, 100); assert.equal(department.sla_initialization_rate, 50); assert.equal(department.mean_first_response_hours, 3); assert.equal(department.total_work_hours, 3);
    assert.equal(metrics.interactions.mean, 6); assert.equal(metrics.evaluation.response_rate, 100); assert.equal(metrics.evaluation.problem_solved_rate, 50); assert.equal(department.mean_interactions, 6); assert.equal(department.mean_evaluation, 4); assert.equal(department.work_elapsed_rate, 27.27);
    assert.equal(metrics.breakdowns.priorities[0].name, 'Alta'); assert.equal(metrics.breakdowns.priorities[0].sla_deadline_rate, 100);
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

test('gera alertas somente quando amostra e limites configurados permitem', () => {
    const facts = {}; for (let index = 0; index < 10; index++) facts[index] = buildMetricFact({ id: String(index), reopened: index < 2, situation: { apply_date: '2026-08-20T10:00:00Z' }, sla: { deadline: { accomplished: index < 8 } } });
    const config = { version: 1, rules: { sla_deadline: { enabled: true, minimum_rate: 90, minimum_sample: 10 }, reopen_rate: { enabled: true, maximum_rate: 10, minimum_sample: 10 }, critical_staleness: { enabled: true, hours: 72, maximum_count: 0 } } };
    const metrics = calculateEnrichedMetrics(facts, 100, '2026-08-25T12:00:00Z', config);
    assert.deepEqual(metrics.alerts.active.map(item => item.id), ['sla_deadline', 'reopen_rate', 'critical_staleness']);
    assert.equal(metrics.alerts.config_version, 1);
});

test('compara volume dimensional dos últimos 30 dias com período anterior', () => {
    const category = { id: 'c', name: 'Acesso' }; const facts = {};
    ['2026-08-24', '2026-08-20', '2026-07-30', '2026-07-10'].forEach((date, index) => { facts[index] = buildMetricFact({ id: String(index), creation_date: `${date}T10:00:00Z`, category }); });
    const result = calculateEnrichedMetrics(facts, 4, '2026-08-25T12:00:00Z').breakdowns.categories[0];
    assert.equal(result.volume_current_30d, 3); assert.equal(result.volume_previous_30d, 1); assert.equal(result.volume_growth_30d, 200);
});
