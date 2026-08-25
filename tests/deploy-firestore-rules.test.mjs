import test from 'node:test';
import assert from 'node:assert/strict';
import { deployFirestoreRules } from '../scripts/deploy-firestore-rules.mjs';

const response = (status, data = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });

test('publica ruleset e aponta a release padrão do Firestore', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return calls.length === 1 ? response(200, { name: 'projects/teste/rulesets/abc' }) : response(200, { name: 'projects/teste/releases/cloud.firestore' });
    };
    const result = await deployFirestoreRules({
        serviceAccountValue: JSON.stringify({ project_id: 'teste' }), rulesContent: 'rules_version = \'2\';', fetchToken: async () => 'token', fetchImpl
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /projects\/teste\/rulesets$/);
    assert.equal(calls[0].body.source.files[0].name, 'firestore.rules');
    assert.equal(calls[1].options.method, 'PATCH');
    assert.equal(calls[1].body.release.rulesetName, 'projects/teste/rulesets/abc');
    assert.equal(result.releaseName, 'projects/teste/releases/cloud.firestore');
});

test('cria a release quando ela ainda não existe', async () => {
    let call = 0; const methods = [];
    const fetchImpl = async (_url, options) => {
        methods.push(options.method); call++;
        if (call === 1) return response(200, { name: 'projects/teste/rulesets/nova' });
        if (call === 2) return response(404, { error: 'not found' });
        return response(200, { name: 'projects/teste/releases/cloud.firestore' });
    };
    await deployFirestoreRules({ serviceAccountValue: JSON.stringify({ project_id: 'teste' }), rulesContent: 'service cloud.firestore {}', fetchToken: async () => 'token', fetchImpl });
    assert.deepEqual(methods, ['POST', 'PATCH', 'POST']);
});
