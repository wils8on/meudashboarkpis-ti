import test from 'node:test';
import assert from 'node:assert/strict';
import { listingFingerprint, selectDetailCandidates, summarizeListingChanges } from '../scripts/incremental-sync.mjs';

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

test('reprocessa detalhe antigo que ainda não possui fato métrico', () => {
    const current = ticket('legado');
    const state = { legado: { list_hash: listingFingerprint(current), detail_hash: 'hash' } };
    assert.equal(selectDetailCandidates([current], state, 20, {}).length, 1);
});
