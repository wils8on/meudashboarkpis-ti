import { createHash } from 'node:crypto';

const clean = value => String(value ?? '').trim() || null;
const fallbackId = (type, value) => createHash('sha256').update(`${type}|${value || 'unknown'}`).digest('hex').slice(0, 24);

function dimension(type, source, extra = {}) {
    if (!source || (!source.id && !source.name)) return null;
    return { type, id: clean(source.id) || fallbackId(type, source.name), name: clean(source.name), ...extra };
}

export function extractDimensions(ticket = {}) {
    const values = [
        dimension('departments', ticket.department),
        dimension('categories', ticket.category, { department_id: clean(ticket.department?.id) }),
        dimension('operators', ticket.responsible_agent),
        dimension('customers', ticket.customer, { email: clean(ticket.customer?.email), organization_id: clean(ticket.customer?.organization?.id) }),
        dimension('organizations', ticket.customer?.organization)
    ];
    (ticket.tags || []).forEach(tag => values.push(dimension('tags', { id: tag.id, name: tag.label }, { color: clean(tag.color) })));
    return values.filter(Boolean);
}
