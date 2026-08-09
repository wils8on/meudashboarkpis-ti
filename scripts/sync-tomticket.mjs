import { writeFile } from 'node:fs/promises';
import { buildSanitizedPayload } from './sanitize-tomticket.mjs';

const token = process.env.TOMTICKET_TOKEN;
if (!token) throw new Error('O segredo TOMTICKET_TOKEN não está configurado.');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const allTickets = [];

for (let page = 1; page <= 150; page += 1) {
    console.log(`Buscando página ${page}...`);
    const url = `https://api.tomticket.com/v2.0/ticket/list?page=${page}&pagina=${page}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`TomTicket respondeu HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
    }

    const payload = await response.json();
    const pageTickets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.chamados)
                ? payload.chamados
                : [];

    if (pageTickets.length === 0) break;
    allTickets.push(...pageTickets);
    console.log(`${allTickets.length} chamados coletados.`);

    if (pageTickets.length < 50) break;
    await delay(1500);
}

const result = buildSanitizedPayload({ data: allTickets });
await writeFile('dados.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Sincronização concluída com ${result.meta.total_records} registros sanitizados.`);
