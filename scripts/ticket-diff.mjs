import { relevantTicketState, ticketStateHash } from './ticket-normalizer.mjs';

export function diffRelevantState(previous, current) {
    if (!previous) return { changed: true, isNew: true, fields: Object.keys(relevantTicketState(current)), hash: ticketStateHash(current) };
    const before = relevantTicketState(previous);
    const after = relevantTicketState(current);
    const fields = Object.keys(after).filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
    return { changed: fields.length > 0, isNew: false, fields, hash: ticketStateHash(current) };
}

export function buildSnapshot(ticket, diff, collectedAt = new Date().toISOString()) {
    if (!diff?.changed) return null;
    return {
        ticket_id: ticket.id,
        protocol: ticket.protocol,
        collected_at: collectedAt,
        changed_fields: diff.fields,
        state_hash: diff.hash,
        ...relevantTicketState(ticket)
    };
}
