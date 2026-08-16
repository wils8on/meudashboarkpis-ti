import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildSanitizedPayload } from './sanitize-tomticket.mjs';
import { publishPrivateTickets } from './private-firestore.mjs';

const MAX_PAGES = 150;
const MAX_SOURCE_AGE_DAYS = 7;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function extractPage(payload) {
    const tickets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.chamados)
                ? payload.chamados
                : [];

    return {
        tickets,
        pages: Number.isFinite(Number(payload?.pages)) ? Number(payload.pages) : null,
        nextPage: payload?.next_page == null ? null : Number(payload.next_page)
    };
}

export function getDateRange(tickets) {
    const dates = tickets
        .map(ticket => ticket?.creation_date)
        .filter(Boolean)
        .map(value => new Date(value))
        .filter(date => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b);
    return { oldest: dates[0] || null, newest: dates.at(-1) || null };
}

export function assertFreshSource(newest, now = new Date(), maxAgeDays = MAX_SOURCE_AGE_DAYS) {
    if (!newest) throw new Error('A API não retornou nenhuma data de criação válida.');
    const ageDays = (now - newest) / 86_400_000;
    if (ageDays > maxAgeDays) {
        throw new Error(`A API retornou dados defasados: chamado mais recente em ${newest.toISOString()} (${Math.floor(ageDays)} dias atrás). Verifique o escopo do token/conta no TomTicket.`);
    }
}

async function sync() {
    const token = process.env.TOMTICKET_TOKEN;
    if (!token) throw new Error('O segredo TOMTICKET_TOKEN não está configurado.');

    const allTickets = [];
    let page = 1;

    while (page && page <= MAX_PAGES) {
        console.log(`Buscando página ${page}...`);
        const url = new URL('https://api.tomticket.com/v2.0/ticket/list');
        url.searchParams.set('page', String(page));
        url.searchParams.set('column', 'creation_date');
        url.searchParams.set('order', 'DESC');
        url.searchParams.set('truncate_body', '1');

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`TomTicket respondeu HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
        }

        const payload = await response.json();
        const { tickets, pages, nextPage } = extractPage(payload);
        if (tickets.length === 0) break;
        allTickets.push(...tickets);
        console.log(`${allTickets.length} chamados coletados; API informa ${pages ?? '?'} página(s).`);

        if (nextPage !== null && Number.isFinite(nextPage)) page = nextPage;
        else if (pages !== null) page = page < pages ? page + 1 : null;
        else page = tickets.length === 50 ? page + 1 : null;
        if (page) await delay(1500);
    }

    const range = getDateRange(allTickets);
    console.log(`Período retornado: ${range.oldest?.toISOString()} a ${range.newest?.toISOString()}.`);
    assertFreshSource(range.newest);

    const result = buildSanitizedPayload({ data: allTickets });
    result.meta.oldest_creation_date = range.oldest?.toISOString() || null;
    result.meta.newest_creation_date = range.newest?.toISOString() || null;
    await writeFile('dados.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Sincronização concluída com ${result.meta.total_records} registros sanitizados.`);

    const privateResult = await publishPrivateTickets(allTickets, process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log(`Camada privada publicada em ${privateResult.chunks} bloco(s), com ${privateResult.totalRecords} registros.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    sync().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
