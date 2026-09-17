import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/incremental-firestore.mjs', import.meta.url), 'utf8');

test('estado métrico é dividido em blocos para respeitar o limite do Firestore', () => {
    assert.match(source, /METRIC_STATE_CHUNK_SIZE = 100/);
    assert.match(source, /metric_state_chunk_/);
    assert.match(source, /metric_state_meta/);
    assert.doesNotMatch(source, /saveMetricState\(state, updatedAt\) \{\s*return put\('tomticket_sync_state', 'metrics'/);
});

test('leitura mantém fallback para o documento métrico legado', () => {
    assert.match(source, /get\('tomticket_sync_state', 'metrics'\)/);
});
