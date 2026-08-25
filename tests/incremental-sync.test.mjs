import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDetailWithRetry, listingFingerprint, selectDetailCandidates, summarizeListingChanges } from '../scripts/incremental-sync.mjs';

const ticket = (id, status = 'Aberto') => ({ id, priority: 2, reopened: false, end_date: null, status: { description: status }, sla: { deadline: { accomplished: true } } });

test('fingerprint muda quando o estado operacional muda', () => {
    assert.notEqual(listingFingerprint(ticket('1')), listingFingerprint(ticket('1', 'Finalizado')));
});

test('prioriza alterados, depois novos e limita detalhes', () => {
    const tickets = [ticket('novo'), ticket('alterado', 'Finalizado'), ticket('pendente')];
    const state = {
        alterado: { list_hash: listingFingerprint(ticket('alterado', 'Aberto')), detail_hash: 'anterior' },
        pendente: { list_hash: listingFingerprint(ticket('pendente')) }
    };
    const selected = selectDetailCandidates(tickets, state, 2);
    assert.deepEqual(selected.map(item => item.ticket.id), ['alterado', 'novo']);
});

test('não consulta detalhe de chamado estável e já enriquecido', () => {
    const current = ticket('estavel');
    const state = { estavel: { list_hash: listingFingerprint(current), detail_hash: 'hash' } };
    assert.equal(selectDetailCandidates([current], state, 20, { estavel: { schema_version: 2, id: 'estavel' } }).length, 0);
});

test('reprocessa fato métrico de versão anterior', () => {
    const current = ticket('versao-antiga'); const state = { 'versao-antiga': { list_hash: listingFingerprint(current), detail_hash: 'hash' } };
    assert.equal(selectDetailCandidates([current], state, 20, { 'versao-antiga': { id: 'versao-antiga' } }).length, 1);
});

test('resume novos e alterados em toda a listagem antes do limite de detalhes', () => {
    const tickets = [ticket('novo'), ticket('alterado', 'Finalizado'), ticket('estavel')];
    const state = { alterado: { list_hash: listingFingerprint(ticket('alterado')) }, estavel: { list_hash: listingFingerprint(ticket('estavel')) } };
    assert.deepEqual(summarizeListingChanges(tickets, state), { new_tickets: 1, changed_tickets: 1 });
});

test('repete erro temporário e respeita retry-after sem expor token', async () => {
    const waits = []; let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? { ok: false, status: 429, headers: { get: () => '2' } } : { ok: true, json: async () => ({ data: { id: 'x' } }) }; };
    const result = await fetchDetailWithRetry('x', 'segredo', { fetchImpl, wait: async ms => waits.push(ms) });
    assert.equal(result.retries, 1); assert.deepEqual(waits, [2000]); assert.equal(result.data.id, 'x');
});

test('não repete erro definitivo da API', async () => {
    let calls = 0; const fetchImpl = async () => { calls++; return { ok: false, status: 404, headers: { get: () => null } }; };
    await assert.rejects(fetchDetailWithRetry('x', 'segredo', { fetchImpl, wait: async () => {} }), /HTTP 404/); assert.equal(calls, 1);
});

test('repete falha temporária de rede', async () => {
    let calls = 0; const waits = []; const fetchImpl = async () => { calls++; if (calls === 1) throw new Error('timeout'); return { ok: true, json: async () => ({ data: { id: 'ok' } }) }; };
    const result = await fetchDetailWithRetry('x', 'segredo', { fetchImpl, wait: async ms => waits.push(ms) });
    assert.equal(result.retries, 1); assert.deepEqual(waits, [1000]);
});

test('reprocessa detalhe antigo que ainda não possui fato métrico', () => {
    const current = ticket('legado');
    const state = { legado: { list_hash: listingFingerprint(current), detail_hash: 'hash' } };
    assert.equal(selectDetailCandidates([current], state, 20, {}).length, 1);
});
