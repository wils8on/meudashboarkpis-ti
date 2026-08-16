import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSanitizedPayload, sanitizeTicket } from '../scripts/sanitize-tomticket.mjs';
import { extractPage, getDateRange, assertFreshSource } from '../scripts/sync-tomticket.mjs';
import { buildPrivateTicket, chunkPrivateTickets } from '../scripts/private-firestore.mjs';

test('remove conteúdo pessoal e preserva somente métricas operacionais', () => {
    const sanitized = sanitizeTicket({
        id: 'secret-id',
        protocol: 123,
        subject: 'Assunto confidencial',
        message: 'Mensagem confidencial',
        customer: {
            name: 'Pessoa Física',
            email: 'pessoa@example.com',
            organization: { name: 'Organização Exemplo' }
        },
        priority: 3,
        creation_date: '2026-01-01 09:00:00-03:00',
        end_date: null,
        reopened: true,
        sla: { deadline: { accomplished: false } },
        situation: { description: 'Em atendimento' }
    });

    const serialized = JSON.stringify(sanitized);
    assert.equal(sanitized.customer.organization.name, 'Organização Exemplo');
    assert.equal(sanitized.reopened, true);
    assert.equal(sanitized.status.description, 'Em atendimento');
    assert.doesNotMatch(serialized, /Pessoa Física|pessoa@example.com|confidencial|secret-id|123/);
});

test('inclui metadados de privacidade e contagem', () => {
    const payload = buildSanitizedPayload({ data: [{}, {}] }, '2026-08-09T00:00:00.000Z');
    assert.equal(payload.meta.privacy, 'sanitized-v1');
    assert.equal(payload.meta.total_records, 2);
    assert.equal(payload.meta.updated_at, '2026-08-09T00:00:00.000Z');
});

test('interpreta os metadados oficiais de paginação do TomTicket', () => {
    const page = extractPage({ data: [{ creation_date: '2026-08-08 10:00:00-03:00' }], pages: 3, next_page: 2 });
    assert.equal(page.tickets.length, 1);
    assert.equal(page.pages, 3);
    assert.equal(page.nextPage, 2);
});

test('detecta a faixa temporal e rejeita uma origem defasada', () => {
    const range = getDateRange([
        { creation_date: '2026-07-16 10:00:00-03:00' },
        { creation_date: '2026-08-08 10:00:00-03:00' }
    ]);
    assert.equal(range.newest.toISOString(), '2026-08-08T13:00:00.000Z');
    assert.doesNotThrow(() => assertFreshSource(range.newest, new Date('2026-08-09T12:00:00Z')));
    assert.throws(() => assertFreshSource(range.oldest, new Date('2026-08-09T12:00:00Z')), /dados defasados/);
});

test('preserva detalhes necessários somente na representação privada', () => {
    const source = {
        protocol: 12345,
        subject: 'Falha no equipamento',
        customer: { name: 'Maria Silva', email: 'MARIA@EXAMPLE.COM', organization: { name: 'Unidade A' } },
        creation_date: '2026-08-10 10:00:00-03:00'
    };
    const privateTicket = buildPrivateTicket(source);
    assert.equal(privateTicket.protocol, 12345);
    assert.equal(privateTicket.customer.name, 'Maria Silva');
    assert.equal(privateTicket.customer.email, 'maria@example.com');
    assert.equal(privateTicket.subject, 'Falha no equipamento');
});

test('divide a camada privada em blocos pequenos', () => {
    const chunks = chunkPrivateTickets(Array.from({ length: 205 }, (_, protocol) => ({ protocol })), 100);
    assert.deepEqual(chunks.map(chunk => chunk.length), [100, 100, 5]);
});
