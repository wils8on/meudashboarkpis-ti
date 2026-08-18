import { getAccessToken } from './private-firestore.mjs';
import { brotliDecompressSync } from 'node:zlib';

const compressedPayload = process.env.SOLUTIONS_IMPORT_GZIP_BASE64 || '';
const records = compressedPayload ? JSON.parse(brotliDecompressSync(Buffer.from(compressedPayload, 'base64')).toString('utf8')) : [];
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!Array.isArray(records) || records.length === 0) throw new Error('O segredo SOLUTIONS_IMPORT_GZIP_BASE64 está vazio.');
if (!serviceAccount.project_id || !serviceAccount.private_key) throw new Error('Credencial Firebase incompleta.');

const firestoreValue = value => {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
    if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    return { stringValue: String(value) };
};

const token = await getAccessToken(serviceAccount);
const importedAt = new Date().toISOString();
const urlFor = id => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/databases/(default)/documents/solucoes_desenvolvidas/${encodeURIComponent(id)}`;

async function write(record) {
    const normalized = {
        ...record,
        historico: Array.isArray(record.historico) && record.historico.length ? record.historico : [{
            data: importedAt,
            acao: 'Importação inicial',
            usuario: 'Carga segura via GitHub Actions',
            origem: 'Solucoes_Desenvolvidas.xlsx',
            alteracoes: [{ field: 'registro', de: '', para: 'Criado' }]
        }],
        createdAt: record.createdAt || importedAt,
        updatedAt: importedAt
    };
    const response = await fetch(urlFor(record.id), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, firestoreValue(value)])) })
    });
    if (!response.ok) throw new Error(`Falha ao gravar ${record.id}: HTTP ${response.status} ${await response.text()}`);
}

for (let offset = 0; offset < records.length; offset += 20) {
    await Promise.all(records.slice(offset, offset + 20).map(write));
}

console.log(`Importação concluída: ${records.length} soluções gravadas no Firestore.`);
