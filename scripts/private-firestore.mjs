import { createSign } from 'node:crypto';

const CHUNK_SIZE = 100;
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

const base64url = value => Buffer.from(value).toString('base64url');

export function buildPrivateTicket(ticket = {}) {
    return {
        protocol: ticket.protocol ?? null,
        subject: String(ticket.subject || '').trim() || 'Sem título',
        customer: {
            name: String(ticket.customer?.name || '').trim() || 'Não identificado',
            email: String(ticket.customer?.email || '').trim().toLowerCase() || null,
            organization: { name: String(ticket.customer?.organization?.name || '').trim() || 'Sem organização' }
        },
        priority: ticket.priority ?? null,
        creation_date: ticket.creation_date || null,
        end_date: ticket.end_date || null,
        sla: { deadline: { accomplished: ticket.sla?.deadline?.accomplished ?? null } },
        reopened: ticket.reopened === true,
        status: { description: ticket.status?.description || ticket.situation?.description || null }
    };
}

export function chunkPrivateTickets(tickets, chunkSize = CHUNK_SIZE) {
    const normalized = tickets.map(buildPrivateTicket);
    return Array.from({ length: Math.ceil(normalized.length / chunkSize) }, (_, index) => normalized.slice(index * chunkSize, (index + 1) * chunkSize));
}

export function createServiceAccountAssertion(serviceAccount, now = Math.floor(Date.now() / 1000)) {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: FIRESTORE_SCOPE,
        aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const unsigned = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
}

export async function getAccessToken(serviceAccount) {
    const assertion = createServiceAccountAssertion(serviceAccount);
    const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    });
    if (!response.ok) throw new Error(`Falha ao autenticar no Firebase: HTTP ${response.status}`);
    return (await response.json()).access_token;
}

async function writeDocument({ projectId, token, documentId, fields }) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/tomticket_private/${documentId}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });
    if (!response.ok) throw new Error(`Falha ao gravar ${documentId} no Firestore: HTTP ${response.status}`);
}

async function deleteDocument({ projectId, token, documentId }) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/tomticket_private/${documentId}`;
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Falha ao remover bloco privado antigo: HTTP ${response.status}`);
}

export async function publishPrivateTickets(tickets, secretValue) {
    if (!secretValue) throw new Error('O segredo FIREBASE_SERVICE_ACCOUNT não está configurado.');
    const serviceAccount = JSON.parse(secretValue);
    const projectId = serviceAccount.project_id;
    if (!projectId || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Credencial de serviço Firebase incompleta.');

    const chunks = chunkPrivateTickets(tickets);
    const token = await getAccessToken(serviceAccount);
    const updatedAt = new Date().toISOString();

    await Promise.all(chunks.map((chunk, index) => writeDocument({
        projectId,
        token,
        documentId: `chunk_${String(index).padStart(3, '0')}`,
        fields: {
            index: { integerValue: String(index) },
            count: { integerValue: String(chunk.length) },
            updated_at: { timestampValue: updatedAt },
            payload: { stringValue: JSON.stringify(chunk) }
        }
    })));

    const metaUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/tomticket_private/meta`;
    const previousMetaResponse = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    let previousChunks = 0;
    if (previousMetaResponse.ok) {
        const previous = await previousMetaResponse.json();
        previousChunks = Number(previous.fields?.chunks?.integerValue || 0);
    }

    await writeDocument({
        projectId,
        token,
        documentId: 'meta',
        fields: {
            chunks: { integerValue: String(chunks.length) },
            total_records: { integerValue: String(tickets.length) },
            updated_at: { timestampValue: updatedAt },
            privacy: { stringValue: 'authenticated-firestore-v1' }
        }
    });

    await Promise.all(Array.from({ length: Math.max(0, previousChunks - chunks.length) }, (_, offset) =>
        deleteDocument({ projectId, token, documentId: `chunk_${String(chunks.length + offset).padStart(3, '0')}` })
    ));
    return { chunks: chunks.length, totalRecords: tickets.length, updatedAt };
}
