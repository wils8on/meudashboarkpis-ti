import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const localKey = 'dashboard-access-users-dev';
let currentAuthorization = window.dashboardAuthorization || null;
let usersCache = [];
let sessionsCache = [];

const app = localDevelopment ? null : (getApps()[0] || initializeApp(firebaseConfig));
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

function localUsers() {
    const stored = JSON.parse(localStorage.getItem(localKey) || 'null');
    return stored || [{ email: 'admin@localhost', nome: 'Administrador local', status: 'permitido', role: 'admin' }];
}

function saveLocalUsers(users) {
    localStorage.setItem(localKey, JSON.stringify(users));
}

function setStatus(message, state = '') {
    const element = document.getElementById('accessFormStatus');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
}

function setSessionStatus(message, state = '') {
    const element = document.getElementById('sessionManagementStatus');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
}

function formatSessionDate(value) {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
        : 'Agora';
}

async function loadSessions() {
    if (localDevelopment) {
        sessionsCache = [{ id: 'local-session', status: 'active', deviceLabel: 'Computador local', browser: 'Navegador de desenvolvimento', platform: navigator.platform, lastSeenAt: new Date() }];
    } else {
        const sessionQuery = query(collection(db, 'user_sessions'), where('uid', '==', auth.currentUser.uid));
        sessionsCache = (await getDocs(sessionQuery)).docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    }
    sessionsCache.sort((a, b) => (b.lastSeenAt?.toMillis?.() || new Date(b.lastSeenAt || 0).getTime()) - (a.lastSeenAt?.toMillis?.() || new Date(a.lastSeenAt || 0).getTime()));
    renderSessions();
}

function renderSessions() {
    const body = document.getElementById('accessSessionsBody');
    if (!body) return;
    body.replaceChildren();
    const currentId = window.dashboardSession?.id;
    const activeOthers = sessionsCache.filter(session => session.status === 'active' && session.id !== currentId);
    const closeOthers = document.getElementById('revokeOtherSessionsButton');
    if (closeOthers) closeOthers.disabled = activeOthers.length === 0;
    document.getElementById('activeSessionsCount').textContent = sessionsCache.filter(session => session.status === 'active').length.toLocaleString('pt-BR');

    if (!sessionsCache.length) {
        body.innerHTML = '<tr><td colspan="5" class="table-empty-state">Nenhuma sessão registrada.</td></tr>';
        return;
    }
    sessionsCache.forEach(session => {
        const isCurrent = session.id === currentId;
        const active = session.status === 'active';
        const row = document.createElement('tr');
        const device = document.createElement('td');
        device.innerHTML = `<div class="access-user-cell"><strong>${session.deviceLabel || 'Dispositivo'}</strong><small>${isCurrent ? 'Esta máquina' : session.id.slice(0, 8)}</small></div>`;
        const browser = document.createElement('td');
        browser.textContent = [session.browser, session.platform].filter(Boolean).join(' · ') || 'Não identificado';
        const activity = document.createElement('td');
        activity.textContent = formatSessionDate(session.lastSeenAt || session.createdAt);
        const statusCell = document.createElement('td');
        statusCell.innerHTML = `<span class="access-status ${active ? 'allowed' : 'blocked'}">${isCurrent && active ? 'Atual' : active ? 'Ativa' : 'Encerrada'}</span>`;
        const actionCell = document.createElement('td');
        actionCell.className = 'session-action-cell';
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'access-action block';
        action.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Encerrar';
        action.disabled = isCurrent || !active;
        action.title = isCurrent ? 'Use o botão Sair para encerrar esta sessão.' : '';
        action.addEventListener('click', () => revokeSession(session.id));
        actionCell.append(action);
        row.append(device, browser, activity, statusCell, actionCell);
        body.append(row);
    });
}

async function revokeSession(sessionId) {
    if (!window.confirm('Encerrar o acesso deste dispositivo?')) return;
    try {
        setSessionStatus('Encerrando sessão...');
        await updateDoc(doc(db, 'user_sessions', sessionId), {
            status: 'revoked', revokedAt: serverTimestamp(), revokedBy: auth.currentUser.email.toLowerCase()
        });
        setSessionStatus('Sessão encerrada. O outro dispositivo será desconectado.', 'success');
        await loadSessions();
    } catch (error) {
        console.error('Falha ao encerrar sessão:', error);
        setSessionStatus('Não foi possível encerrar a sessão.', 'error');
    }
}

async function revokeOtherSessions() {
    const currentId = window.dashboardSession?.id;
    const targets = sessionsCache.filter(session => session.status === 'active' && session.id !== currentId);
    if (!targets.length || !window.confirm(`Encerrar ${targets.length} sessão(ões) em outros dispositivos?`)) return;
    try {
        setSessionStatus('Encerrando outras sessões...');
        const batch = writeBatch(db);
        targets.forEach(session => batch.update(doc(db, 'user_sessions', session.id), {
            status: 'revoked', revokedAt: serverTimestamp(), revokedBy: auth.currentUser.email.toLowerCase()
        }));
        await batch.commit();
        setSessionStatus('Todas as outras sessões foram encerradas.', 'success');
        await loadSessions();
    } catch (error) {
        console.error('Falha ao encerrar outras sessões:', error);
        setSessionStatus('Não foi possível encerrar todas as sessões.', 'error');
    }
}

async function loadUsers() {
    usersCache = localDevelopment
        ? localUsers()
        : (await getDocs(collection(db, 'usuarios_autorizados'))).docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    usersCache.sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
    renderUsers();
}

function renderUsers() {
    const body = document.getElementById('accessUsersBody');
    if (!body) return;
    body.replaceChildren();
    const ownEmail = (auth?.currentUser?.email || currentAuthorization?.email || '').toLowerCase();

    document.getElementById('accessTotalCount').textContent = usersCache.length.toLocaleString('pt-BR');
    document.getElementById('accessAllowedCount').textContent = usersCache.filter(user => user.status === 'permitido').length.toLocaleString('pt-BR');
    document.getElementById('accessBlockedCount').textContent = usersCache.filter(user => user.status === 'bloqueado').length.toLocaleString('pt-BR');

    if (!usersCache.length) {
        body.innerHTML = '<tr><td colspan="4" class="table-empty-state">Nenhum usuário cadastrado.</td></tr>';
        return;
    }

    usersCache.forEach(user => {
        const email = String(user.email || user.id || '').toLowerCase();
        const isSelf = email === ownEmail;
        const row = document.createElement('tr');

        const identity = document.createElement('td');
        const identityBox = document.createElement('div');
        identityBox.className = 'access-user-cell';
        const name = document.createElement('strong');
        name.textContent = user.nome || email.split('@')[0];
        const emailLabel = document.createElement('small');
        emailLabel.textContent = email;
        identityBox.append(name, emailLabel);
        identity.append(identityBox);

        const roleCell = document.createElement('td');
        const role = document.createElement('span');
        role.className = 'access-role';
        role.textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
        roleCell.append(role);

        const statusCell = document.createElement('td');
        const status = document.createElement('span');
        status.className = `access-status ${user.status === 'permitido' ? 'allowed' : 'blocked'}`;
        status.textContent = user.status === 'permitido' ? 'Permitido' : 'Bloqueado';
        statusCell.append(status);

        const actionsCell = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'access-actions';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = `access-action ${user.status === 'permitido' ? 'block' : 'allow'}`;
        toggle.innerHTML = user.status === 'permitido' ? '<i class="fa-solid fa-user-lock"></i> Bloquear' : '<i class="fa-solid fa-user-check"></i> Permitir';
        toggle.disabled = isSelf;
        toggle.title = isSelf ? 'O administrador não pode bloquear o próprio acesso.' : '';
        toggle.addEventListener('click', () => toggleAccess(email, user.status));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'access-action delete';
        remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
        remove.setAttribute('aria-label', `Excluir acesso de ${email}`);
        remove.disabled = isSelf;
        remove.addEventListener('click', () => removeUser(email));
        actions.append(toggle, remove);
        actionsCell.append(actions);
        row.append(identity, roleCell, statusCell, actionsCell);
        body.append(row);
    });
}

async function createUser(event) {
    event.preventDefault();
    const nameInput = document.getElementById('accessUserName');
    const emailInput = document.getElementById('accessUserEmail');
    const email = emailInput.value.trim().toLowerCase();
    const nome = nameInput.value.trim();
    if (!emailInput.checkValidity()) return emailInput.reportValidity();
    if (usersCache.some(user => String(user.email || user.id).toLowerCase() === email)) {
        setStatus('Este e-mail já está cadastrado.', 'error');
        return;
    }

    try {
        setStatus('Cadastrando usuário...');
        const record = { email, nome, status: 'permitido', role: 'usuario' };
        if (localDevelopment) {
            saveLocalUsers([...usersCache, record]);
        } else {
            await setDoc(doc(db, 'usuarios_autorizados', email), {
                ...record,
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser.email.toLowerCase()
            });
        }
        event.target.reset();
        setStatus('Usuário cadastrado e autorizado com sucesso.', 'success');
        await loadUsers();
    } catch (error) {
        console.error('Falha ao cadastrar acesso:', error);
        setStatus('Não foi possível cadastrar. Confirme suas permissões de administrador.', 'error');
    }
}

async function toggleAccess(email, currentStatus) {
    const nextStatus = currentStatus === 'permitido' ? 'bloqueado' : 'permitido';
    if (!window.confirm(`${nextStatus === 'bloqueado' ? 'Bloquear' : 'Restabelecer'} o acesso de ${email}?`)) return;
    try {
        if (localDevelopment) {
            saveLocalUsers(usersCache.map(user => user.email === email ? { ...user, status: nextStatus } : user));
        } else {
            await updateDoc(doc(db, 'usuarios_autorizados', email), { status: nextStatus, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.email.toLowerCase() });
        }
        setStatus(`Acesso de ${email} ${nextStatus === 'permitido' ? 'restabelecido' : 'bloqueado'}.`, 'success');
        await loadUsers();
    } catch (error) {
        console.error('Falha ao alterar acesso:', error);
        setStatus('Não foi possível alterar o acesso.', 'error');
    }
}

async function removeUser(email) {
    if (!window.confirm(`Excluir definitivamente o cadastro de acesso de ${email}?`)) return;
    try {
        if (localDevelopment) saveLocalUsers(usersCache.filter(user => user.email !== email));
        else await deleteDoc(doc(db, 'usuarios_autorizados', email));
        setStatus(`Cadastro de ${email} excluído.`, 'success');
        await loadUsers();
    } catch (error) {
        console.error('Falha ao excluir acesso:', error);
        setStatus('Não foi possível excluir o cadastro.', 'error');
    }
}

async function initializeAdmin(authorization) {
    currentAuthorization = authorization;
    if (authorization?.role !== 'admin') return;
    const nav = document.getElementById('adminAccessNav');
    if (nav) nav.hidden = false;
    document.getElementById('accessUserForm')?.addEventListener('submit', createUser);
    document.getElementById('accessRefreshButton')?.addEventListener('click', loadUsers);
    document.getElementById('sessionsRefreshButton')?.addEventListener('click', loadSessions);
    document.getElementById('revokeOtherSessionsButton')?.addEventListener('click', revokeOtherSessions);
    try {
        await Promise.all([loadUsers(), loadSessions()]);
    } catch (error) {
        console.error('Falha ao carregar diretório de acesso:', error);
        setStatus('Não foi possível carregar os usuários autorizados.', 'error');
    }
}

window.addEventListener('dashboard-auth-ready', event => initializeAdmin(event.detail), { once: true });
if (currentAuthorization) initializeAdmin(currentAuthorization);
