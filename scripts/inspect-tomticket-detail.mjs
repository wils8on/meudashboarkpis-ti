import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { extractPage } from './sync-tomticket.mjs';

const API_ROOT = 'https://api.tomticket.com/v2.0';

export function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value === 'object' ? 'object' : typeof value;
}

export function collectSchema(value, path = '$', output = new Map()) {
    const type = valueType(value);
    if (!output.has(path)) output.set(path, new Set());
    output.get(path).add(type);

    if (Array.isArray(value)) {
        value.slice(0, 5).forEach(item => collectSchema(item, `${path}[]`, output));
    } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, child]) => collectSchema(child, `${path}.${key}`, output));
    }
    return output;
}

export function serializeSchema(schema) {
    return [...schema.entries()]
        .map(([path, types]) => ({ path, types: [...types].sort() }))
        .sort((a, b) => a.path.localeCompare(b.path));
}

async function requestJson(url, token) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`TomTicket respondeu HTTP ${response.status} em ${url.pathname}.`);
    return response.json();
}

export async function inspectTicketDetail(token, outputPath = 'tomticket-detail-schema.json') {
    if (!token) throw new Error('O segredo TOMTICKET_TOKEN não está configurado.');

    const listUrl = new URL(`${API_ROOT}/ticket/list`);
    listUrl.searchParams.set('page', '1');
    listUrl.searchParams.set('column', 'creation_date');
    listUrl.searchParams.set('order', 'DESC');
    listUrl.searchParams.set('truncate_body', '1');
    const listPayload = await requestJson(listUrl, token);
    const { tickets } = extractPage(listPayload);
    const ticketId = tickets.find(ticket => ticket?.id)?.id;
    if (!ticketId) throw new Error('A listagem não retornou um identificador de chamado utilizável.');

    const detailUrl = new URL(`${API_ROOT}/ticket/detail`);
    detailUrl.searchParams.set('ticket_id', String(ticketId));
    detailUrl.searchParams.set('show_stopwatch', '1');
    detailUrl.searchParams.set('show_staggered_tickets', '1');
    detailUrl.searchParams.set('show_tags', '1');
    const detailPayload = await requestJson(detailUrl, token);
    if (detailPayload?.error === true || !detailPayload?.data) throw new Error('O endpoint de detalhe não retornou um objeto data válido.');

    const report = {
        generated_at: new Date().toISOString(),
        endpoint: '/v2.0/ticket/detail',
        options: { show_stopwatch: true, show_staggered_tickets: true, show_tags: true },
        privacy: 'schema-only-no-values',
        fields: serializeSchema(collectSchema(detailPayload.data))
    };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    inspectTicketDetail(process.env.TOMTICKET_TOKEN, process.argv[2]).then(report => {
        console.log(`Inspeção concluída: ${report.fields.length} caminhos estruturais identificados; nenhum valor foi persistido.`);
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
