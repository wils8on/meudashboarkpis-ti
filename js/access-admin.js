import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const localKey = 'dashboard-access-users-dev';
let currentAuthorization = window.dashboardAuthorization || null;
let usersCache = [];

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
    try {
        await loadUsers();
    } catch (error) {
        console.error('Falha ao carregar diretório de acesso:', error);
        setStatus('Não foi possível carregar os usuários autorizados.', 'error');
    }
}

window.addEventListener('dashboard-auth-ready', event => initializeAdmin(event.detail), { once: true });
if (currentAuthorization) initializeAdmin(currentAuthorization);
