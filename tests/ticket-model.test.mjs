import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicketDetail, ticketStateHash } from '../scripts/ticket-normalizer.mjs';
import { buildSnapshot, diffRelevantState } from '../scripts/ticket-diff.mjs';

const raw = {
    id: 'ticket-1', protocol: 123, subject: 'Teste', priority: 3, creation_date: '2026-08-25 08:00:00-03:00',
    customer: { id: 'c1', name: 'Pessoa', email: 'PESSOA@EXAMPLE.COM', organization: { id: 'o1', name: 'Empresa' } },
    department: { id: 'd1', name: 'TI' }, category: { id: 'cat1', name: 'Acesso' }, operator: { id: 'op1', name: 'Atendente' },
    situation: { id: 1, description: 'Em análise', apply_date: '2026-08-25 09:00:00-03:00' },
    sla: { startup: { date: '2026-08-25 08:30:00-03:00', accomplished: true }, deadline: { date: '2026-08-26 08:00:00-03:00', accomplished: false } },
    tags: null, stopwatch: null, staggered: null, replies: []
};

test('normaliza detalhe real sem depender de arrays presentes', () => {
    const ticket = normalizeTicketDetail(raw, '2026-08-25T12:00:00.000Z');
    assert.equal(ticket.customer.email, 'pessoa@example.com');
    assert.equal(ticket.sla.initialization.accomplished, true);
    assert.deepEqual(ticket.tags, []);
    assert.equal(ticket.interaction_count, 0);
});

test('hash ignora collected_at e conteúdo não gerencial', () => {
    const first = normalizeTicketDetail(raw, '2026-08-25T12:00:00.000Z');
    const second = normalizeTicketDetail(raw, '2026-08-25T13:00:00.000Z');
    assert.equal(ticketStateHash(first), ticketStateHash(second));
});

test('detecta somente alterações relevantes e cria snapshot', () => {
    const previous = normalizeTicketDetail(raw);
    const current = normalizeTicketDetail({ ...raw, priority: 4, situation: { ...raw.situation, description: 'Em atendimento' } });
    const diff = diffRelevantState(previous, current);
    assert.equal(diff.changed, true);
    assert.deepEqual(diff.fields.sort(), ['priority', 'situation']);
    assert.deepEqual(buildSnapshot(current, diff).changed_fields.sort(), ['priority', 'situation']);
});

test('não cria snapshot sem mudança relevante', () => {
    const ticket = normalizeTicketDetail(raw);
    const diff = diffRelevantState(ticket, { ...ticket, collected_at: 'outra-data' });
    assert.equal(diff.changed, false);
    assert.equal(buildSnapshot(ticket, diff), null);
});
