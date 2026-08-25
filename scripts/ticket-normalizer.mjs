import { createHash } from 'node:crypto';

const clean = value => typeof value === 'string' ? value.trim() || null : value ?? null;
const entity = value => value && typeof value === 'object' ? { id: clean(value.id), name: clean(value.name) } : { id: null, name: null };
const list = value => Array.isArray(value) ? value : [];

export function normalizeTicketDetail(detail = {}, collectedAt = new Date().toISOString()) {
    return {
        id: clean(detail.id),
        protocol: detail.protocol ?? null,
        subject: clean(detail.subject),
        ticket_type: clean(detail.ticket_type),
        priority: detail.priority ?? null,
        creation_date: clean(detail.creation_date),
        end_date: clean(detail.end_date),
        schedule_date: clean(detail.schedule_date),
        first_reply_date: clean(detail.first_reply_date),
        work_time_seconds: Number.isFinite(Number(detail.work_time)) ? Number(detail.work_time) : null,
        elapsed_time: clean(detail.elapsed_time),
        reopened: detail.reopened === true,
        closed_by_inactivity: detail.closed_by_inactivity === true,
        customer: {
            id: clean(detail.customer?.id),
            internal_id: clean(detail.customer?.internal_id),
            name: clean(detail.customer?.name),
            email: clean(detail.customer?.email)?.toLowerCase() || null,
            organization: entity(detail.customer?.organization)
        },
        department: entity(detail.department),
        category: entity(detail.category),
        responsible_agent: entity(detail.operator),
        situation: {
            id: detail.situation?.id ?? null,
            description: clean(detail.situation?.description),
            apply_date: clean(detail.situation?.apply_date)
        },
        sla: {
            initialization: {
                date: clean(detail.sla?.startup?.date),
                accomplished: detail.sla?.startup?.accomplished ?? null
            },
            deadline: {
                date: clean(detail.sla?.deadline?.date),
                accomplished: detail.sla?.deadline?.accomplished ?? null
            }
        },
        evaluation: {
            grade: clean(detail.evaluation?.grade),
            problem_solved: detail.evaluation?.problem_solved ?? null,
            comment: clean(detail.evaluation?.comment)
        },
        tags: list(detail.tags).map(tag => ({ id: clean(tag?.id), label: clean(tag?.label), color: clean(tag?.color) })),
        stopwatch: list(detail.stopwatch).map(item => ({
            id: clean(item?.id), start: clean(item?.start), end: clean(item?.end),
            created_manually: item?.created_manually === true, operator: clean(item?.operator)
        })),
        staggered: list(detail.staggered).map(item => ({ id: clean(item?.id), protocol: item?.protocol ?? null, subject: clean(item?.subject) })),
        interaction_count: list(detail.replies).length,
        collected_at: collectedAt
    };
}

export function relevantTicketState(ticket = {}) {
    return {
        situation: ticket.situation,
        priority: ticket.priority,
        reopened: ticket.reopened,
        end_date: ticket.end_date,
        sla: ticket.sla,
        responsible_agent: ticket.responsible_agent,
        department: ticket.department,
        category: ticket.category,
        first_reply_date: ticket.first_reply_date,
        work_time_seconds: ticket.work_time_seconds,
        tags: ticket.tags
    };
}

export function ticketStateHash(ticket = {}) {
    return createHash('sha256').update(JSON.stringify(relevantTicketState(ticket))).digest('hex');
}
