import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getAccessToken } from './private-firestore.mjs';

const API_ROOT = 'https://firebaserules.googleapis.com/v1';
const RULES_SCOPE = 'https://www.googleapis.com/auth/firebase';

async function request(url, token, options = {}, fetchImpl = fetch) {
    const response = await fetchImpl(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`Firebase Rules HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.status === 204 ? null : response.json();
}

export async function deployFirestoreRules({ serviceAccountValue, rulesContent, fetchToken = getAccessToken, fetchImpl = fetch } = {}) {
    if (!serviceAccountValue) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurado.');
    const serviceAccount = JSON.parse(serviceAccountValue);
    const projectId = serviceAccount.project_id;
    if (!projectId) throw new Error('Credencial Firebase sem project_id.');
    const token = await fetchToken(serviceAccount, RULES_SCOPE);
    const projectName = `projects/${projectId}`;
    const ruleset = await request(`${API_ROOT}/${projectName}/rulesets`, token, {
        method: 'POST', body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesContent }] } })
    }, fetchImpl);
    const releaseName = `${projectName}/releases/cloud.firestore`;
    try {
        await request(`${API_ROOT}/${releaseName}`, token, {
            method: 'PATCH', body: JSON.stringify({ release: { name: releaseName, rulesetName: ruleset.name }, updateMask: 'ruleset_name' })
        }, fetchImpl);
    } catch (error) {
        if (!String(error.message).includes('HTTP 404')) throw error;
        await request(`${API_ROOT}/${projectName}/releases`, token, {
            method: 'POST', body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name })
        }, fetchImpl);
    }
    return { projectId, rulesetName: ruleset.name, releaseName };
}

async function main() {
    const rulesContent = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    const result = await deployFirestoreRules({ serviceAccountValue: process.env.FIREBASE_SERVICE_ACCOUNT, rulesContent });
    console.log(`Regras publicadas em ${result.releaseName} usando ${result.rulesetName}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
