import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('documentação cobre operação, segurança e recuperação da integração', async () => {
    const [readme, manual] = await Promise.all([
        read('README.md'),
        read('docs/OPERACAO_TOMTICKET.md')
    ]);
    const documentation = `${readme}\n${manual}`;
    const requiredReferences = [
        'TOMTICKET_TOKEN',
        'FIREBASE_SERVICE_ACCOUNT',
        'config/backlog-status-map.json',
        'config/operational-alerts.json',
        'tomticket_private/metrics',
        '/v2.0/ticket/detail',
        '20 minutos',
        'dados já publicados são preservados',
        'cobertura enriquecida'
    ];

    for (const reference of requiredReferences) {
        assert.ok(documentation.includes(reference), `Referência operacional ausente: ${reference}`);
    }
});

