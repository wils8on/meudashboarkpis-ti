import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSanitizedPayload, sanitizeTicket } from '../scripts/sanitize-tomticket.mjs';

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
