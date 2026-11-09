import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const app = localDevelopment ? null : (getApps()[0] || initializeApp(firebaseConfig));
const db = app ? getFirestore(app) : null;
let tickets = [];
let selectedId = null;

const byId = id => document.getElementById(id);

function cleanText(value) {
    if (!value) return '';
    const withBreaks = String(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
    const parsed = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (parsed.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function formatDate(value) {
    if (!value) return 'Data não informada';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatSize(value) {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

function statusText(ticket) {
    return ticket.status?.description || ticket.situation?.description || 'Status não informado';
}

function resultButton(ticket) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ticket-history-result';
    button.dataset.selected = String(ticket.id) === String(selectedId) ? 'true' : 'false';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', button.dataset.selected);

    const top = document.createElement('span');
    top.className = 'ticket-history-result-top';
    const protocol = document.createElement('strong');
    protocol.textContent = `#${ticket.protocol || '—'}`;
    const state = document.createElement('small');
    state.textContent = statusText(ticket);
    top.append(protocol, state);

    const subject = document.createElement('span');
    subject.className = 'ticket-history-result-subject';
    subject.textContent = ticket.subject || 'Sem título';
    const customer = document.createElement('small');
    customer.className = 'ticket-history-result-customer';
    customer.textContent = `${ticket.customer?.name || 'Solicitante não identificado'} · ${formatDate(ticket.creation_date)}`;
    button.append(top, subject, customer);
    button.addEventListener('click', () => selectTicket(ticket));
    return button;
}

function renderResults() {
    const container = byId('ticketHistoryResults');
    if (!container) return;
    const term = (byId('ticketHistorySearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filtered = tickets.filter(ticket => !term || [ticket.protocol, ticket.subject, ticket.customer?.name, ticket.customer?.email]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term)))
        .sort((a, b) => new Date(b.creation_date || 0) - new Date(a.creation_date || 0));
    const visible = filtered.slice(0, 100);
    byId('ticketHistoryCount').textContent = `${filtered.length.toLocaleString('pt-BR')} chamado(s) encontrado(s)`;
    container.replaceChildren(...visible.map(resultButton));
    if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'ticket-history-no-results';
        empty.textContent = 'Nenhum chamado corresponde à busca.';
        container.append(empty);
    }
}

function attachmentLink(item) {
    const link = document.createElement('a');
    link.className = 'ticket-message-attachment';
    const url = String(item?.url || '');
    if (/^https:\/\//i.test(url)) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    } else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
    }
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-paperclip';
    const label = document.createElement('span');
    label.textContent = item?.name || 'Anexo';
    const size = document.createElement('small');
    size.textContent = formatSize(item?.size);
    link.append(icon, label, size);
    return link;
}

function timelineItem(message) {
    const article = document.createElement('article');
    article.className = `ticket-message ${message.type === 'operator' ? 'is-operator' : 'is-customer'}`;
    const marker = document.createElement('span');
    marker.className = 'ticket-message-marker';
    marker.innerHTML = `<i class="fa-solid ${message.type === 'operator' ? 'fa-headset' : 'fa-user'}"></i>`;
    const card = document.createElement('div');
    card.className = 'ticket-message-card';
    const header = document.createElement('header');
    const sender = document.createElement('strong');
    sender.textContent = message.sender;
    const metadata = document.createElement('span');
    metadata.textContent = `${message.type === 'operator' ? 'Atendente' : 'Cliente'} · ${formatDate(message.date)}`;
    header.append(sender, metadata);
    const body = document.createElement('p');
    body.textContent = cleanText(message.message) || 'Mensagem sem conteúdo textual.';
    card.append(header, body);
    if (message.attachments?.length) {
        const attachments = document.createElement('div');
        attachments.className = 'ticket-message-attachments';
        message.attachments.forEach(item => attachments.append(attachmentLink(item)));
        card.append(attachments);
    }
    article.append(marker, card);
    return article;
}

function renderConversation(ticket, detail) {
    byId('ticketConversationProtocol').textContent = `#${detail.protocol || ticket.protocol || '—'}`;
    byId('ticketConversationSubject').textContent = detail.subject || ticket.subject || 'Sem título';
    byId('ticketConversationMeta').textContent = `${detail.customer?.name || ticket.customer?.name || 'Solicitante não identificado'} · ${detail.responsible_agent?.name || ticket.responsible_agent?.name || 'Não atribuído'} · aberto em ${formatDate(detail.creation_date || ticket.creation_date)}`;
    byId('ticketConversationStatus').textContent = detail.situation?.description || statusText(ticket);
    const messages = [];
    if (detail.opening_message?.message) messages.push({
        type: 'customer', sender: detail.customer?.name || ticket.customer?.name || 'Cliente',
        date: detail.creation_date || ticket.creation_date, message: detail.opening_message.message,
        attachments: detail.opening_message.attachments || []
    });
    (detail.replies || []).forEach(reply => messages.push({
        type: String(reply.sender_type || '').toUpperCase() === 'A' ? 'operator' : 'customer',
        sender: reply.sender || (String(reply.sender_type || '').toUpperCase() === 'A' ? 'Atendente' : 'Cliente'),
        date: reply.date, message: reply.message, attachments: reply.attachments || []
    }));
    messages.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const timeline = byId('ticketConversationTimeline');
    timeline.replaceChildren(...messages.map(timelineItem));
    const notice = byId('ticketConversationNotice');
    notice.textContent = messages.length
        ? `${messages.length.toLocaleString('pt-BR')} mensagem(ns) na conversa.`
        : 'O detalhe está disponível, mas ainda não contém mensagens armazenadas. A próxima sincronização atualizará este chamado.';
}

async function loadDetail(ticket) {
    if (localDevelopment) return {
        ...ticket, customer: ticket.customer, responsible_agent: ticket.responsible_agent,
        situation: { description: statusText(ticket) },
        opening_message: { message: 'Mensagem de abertura para demonstração local.', attachments: [] },
        replies: [{ id: 'demo', sender_type: 'A', sender: 'Atendente de teste', date: new Date().toISOString(), message: 'Resposta de demonstração.', attachments: [] }]
    };
    if (!ticket.id) throw new Error('Este chamado ainda não possui identificador sincronizado. Aguarde a próxima atualização.');
    const snapshot = await getDoc(doc(db, 'tomticket_tickets', String(ticket.id)));
    if (!snapshot.exists()) throw new Error('O detalhe deste chamado ainda não foi enriquecido. Aguarde a próxima sincronização.');
    try { return JSON.parse(snapshot.data().payload || '{}'); }
    catch { throw new Error('O histórico armazenado para este chamado está inválido.'); }
}

async function selectTicket(ticket) {
    selectedId = ticket.id;
    renderResults();
    byId('ticketConversationEmpty').hidden = true;
    byId('ticketConversationContent').hidden = false;
    byId('ticketConversationProtocol').textContent = `#${ticket.protocol || '—'}`;
    byId('ticketConversationSubject').textContent = ticket.subject || 'Sem título';
    byId('ticketConversationMeta').textContent = 'Carregando histórico protegido…';
    byId('ticketConversationStatus').textContent = statusText(ticket);
    byId('ticketConversationTimeline').replaceChildren();
    byId('ticketConversationNotice').textContent = 'Consultando o Firestore…';
    try { renderConversation(ticket, await loadDetail(ticket)); }
    catch (error) { byId('ticketConversationNotice').textContent = error.message; }
}

async function loadTickets() {
    byId('ticketHistoryCount').textContent = 'Carregando chamados…';
    try {
        tickets = window.privateTicketStoreReady ? await window.privateTicketStoreReady : [];
        renderResults();
    } catch (error) {
        byId('ticketHistoryCount').textContent = 'Não foi possível carregar os chamados.';
        console.error('Falha ao carregar histórico de chamados:', error);
    }
}

byId('ticketHistorySearch')?.addEventListener('input', renderResults);
byId('ticketHistoryRefresh')?.addEventListener('click', loadTickets);
loadTickets();
