import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSchema, serializeSchema, valueType } from '../scripts/inspect-tomticket-detail.mjs';

test('valueType distingue null, arrays e objetos', () => {
    assert.equal(valueType(null), 'null');
    assert.equal(valueType([]), 'array');
    assert.equal(valueType({}), 'object');
    assert.equal(valueType('segredo'), 'string');
});

test('relatório contém somente caminhos e tipos, nunca valores', () => {
    const schema = serializeSchema(collectSchema({
        id: 'ID-SENSIVEL',
        customer: { email: 'pessoa@example.com' },
        tags: [{ label: 'Financeiro' }]
    }));
    const serialized = JSON.stringify(schema);
    assert.match(serialized, /\$\.customer\.email/);
    assert.match(serialized, /\$\.tags\[\]\.label/);
    assert.doesNotMatch(serialized, /ID-SENSIVEL|pessoa@example\.com|Financeiro/);
});

test('arrays vazios permanecem registrados como arrays', () => {
    const schema = serializeSchema(collectSchema({ stopwatch: [] }));
    assert.deepEqual(schema.find(item => item.path === '$.stopwatch')?.types, ['array']);
});
