import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function extractTickets(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.chamados)) return payload.chamados;
    throw new Error('Formato de dados do TomTicket não reconhecido.');
}

export function sanitizeTicket(ticket = {}) {
    const organizationName = ticket.customer?.organization?.name?.trim() || 'Sem organização';
    const statusDescription = ticket.status?.description || ticket.situation?.description || null;

    return {
        customer: { organization: { name: organizationName } },
        priority: ticket.priority ?? null,
        creation_date: ticket.creation_date || null,
        end_date: ticket.end_date || null,
        sla: { deadline: { accomplished: ticket.sla?.deadline?.accomplished ?? null } },
        reopened: ticket.reopened === true,
        status: { description: statusDescription }
    };
}

export function buildSanitizedPayload(payload, updatedAt = new Date().toISOString()) {
    const data = extractTickets(payload).map(sanitizeTicket);
    return {
        meta: {
            source: 'TomTicket API v2.0',
            updated_at: updatedAt,
            total_records: data.length,
            privacy: 'sanitized-v1'
        },
        data
    };
}

async function runCli() {
    const [, , inputPath = 'dados.json', outputPath = inputPath] = process.argv;
    const source = JSON.parse(await readFile(inputPath, 'utf8'));
    const sanitized = buildSanitizedPayload(source);
    await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
    console.log(`Base sanitizada: ${sanitized.meta.total_records} registros gravados em ${outputPath}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
