import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDetailQuality, inspectListingQuality, summarizeQuality } from '../scripts/ticket-quality.mjs';
import { extractDimensions } from '../scripts/ticket-dimensions.mjs';

test('qualidade registra inconsistências sem lançar erro', () => {
    const report = inspectListingQuality([
        { id: '1', protocol: 10, priority: 9, creation_date: 'inválida', status: { description: 'Finalizado' }, sla: { deadline: {} } },
        { id: '2', protocol: 10, priority: 2, creation_date: '2026-08-25', status: {} }
    ]);
    assert.equal(report.counts.duplicate_protocol, 1);
    assert.equal(report.counts.invalid_creation_date, 1);
    assert.equal(report.counts.closed_without_end_date, 1);
    assert.equal(report.counts.unknown_priority, 1);
    assert.ok(report.total_issues >= 4);
});

test('qualidade de detalhe identifica relacionamentos ausentes', () => {
    const report = inspectListingQuality([]);
    inspectDetailQuality({ id: '1', customer: {}, department: {}, category: {}, responsible_agent: {}, sla: { initialization: {} } }, report);
    assert.equal(report.counts.missing_department, 1);
    assert.equal(report.counts.missing_category, 1);
    assert.equal(report.counts.missing_responsible_agent, 1);
});

test('extrai dimensões consistentes e tags', () => {
    const dimensions = extractDimensions({
        department: { id: 'd1', name: 'TI' }, category: { id: 'c1', name: 'Acesso' }, responsible_agent: { id: 'o1', name: 'Ana' },
        customer: { id: 'u1', name: 'Usuário', email: 'u@example.com', organization: { id: 'org1', name: 'Empresa' } },
        tags: [{ id: 't1', label: 'Urgente', color: '#f00' }]
    });
    assert.deepEqual(dimensions.map(item => item.type), ['departments', 'categories', 'operators', 'customers', 'organizations', 'tags']);
    assert.equal(dimensions.find(item => item.type === 'categories').department_id, 'd1');
});

test('resume qualidade sem expor amostras ou detalhes dos chamados', () => {
    const summary = summarizeQuality({ generated_at: '2026-08-25T12:00:00Z', records: 10, counts: { duplicate_protocol: 1, missing_department: 2 }, samples: [{ protocol: 123 }] });
    assert.equal(summary.status, 'critical'); assert.equal(summary.critical, 1); assert.equal(summary.warnings, 2); assert.equal(summary.issues[0].label, 'Protocolo duplicado'); assert.equal('samples' in summary, false);
});
