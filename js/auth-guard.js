import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const SESSION_KEY = 'dashboard_session_id_v1';
const HEARTBEAT_INTERVAL = 60_000;

function newSessionId() {
    return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deviceDescription() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Microsoft Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Google Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Dispositivo desconhecido';
    const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(ua);
    return { browser, platform, deviceLabel: `${mobile ? 'Dispositivo móvel' : 'Computador'} · ${platform}` };
}

if (localDevelopment) {
    window.dashboardAuthorization = { email: 'admin@localhost', nome: 'Administrador local', status: 'permitido', role: 'admin' };
    window.dashboardSession = { id: 'local-session', current: true };
    window.dispatchEvent(new CustomEvent('dashboard-auth-ready', { detail: window.dashboardAuthorization }));
    window.dashboardSignOut = async () => window.location.assign('index.html');
    document.body.classList.remove('auth-pending');
} else {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let heartbeatTimer = null;
    let unsubscribeAuthorization = null;
    let unsubscribeSession = null;
    let leaving = false;

    function clearRuntime() {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        unsubscribeAuthorization?.();
        unsubscribeSession?.();
        unsubscribeAuthorization = null;
        unsubscribeSession = null;
    }

    async function leaveDashboard(message = '') {
        if (leaving) return;
        leaving = true;
        clearRuntime();
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('logado');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_nome');
        if (message) sessionStorage.setItem('dashboard_logout_notice', message);
        try { await signOut(auth); } catch (error) { console.warn('Não foi possível encerrar a sessão no Firebase:', error); }
        window.location.replace('index.html');
    }

    async function registerSession(user) {
        let sessionId = localStorage.getItem(SESSION_KEY);
        if (!sessionId) {
            sessionId = newSessionId();
            localStorage.setItem(SESSION_KEY, sessionId);
        }
        const sessionRef = doc(db, 'user_sessions', sessionId);
        const existing = await getDoc(sessionRef);
        if (existing.exists() && existing.data().status !== 'active') {
            await leaveDashboard('Esta sessão foi encerrada remotamente. Entre novamente se necessário.');
            throw new Error('Sessão revogada.');
        }
        const device = deviceDescription();
        if (!existing.exists()) {
            await setDoc(sessionRef, {
                sessionId, uid: user.uid, email: user.email.toLowerCase(), status: 'active', ...device,
                createdAt: serverTimestamp(), lastSeenAt: serverTimestamp()
            });
        } else {
            await updateDoc(sessionRef, { lastSeenAt: serverTimestamp() });
        }
        window.dashboardSession = { id: sessionId, current: true, ...device };
        return sessionRef;
    }

    function watchAccess(authorizationRef, sessionRef) {
        unsubscribeAuthorization = onSnapshot(authorizationRef, snapshot => {
            if (!snapshot.exists() || snapshot.data().status !== 'permitido') leaveDashboard('Seu acesso ao painel foi interrompido pelo administrador.');
        }, error => console.warn('Monitoramento da autorização indisponível:', error));
        unsubscribeSession = onSnapshot(sessionRef, snapshot => {
            if (!snapshot.exists() || snapshot.data().status !== 'active') leaveDashboard('Esta sessão foi encerrada remotamente.');
        }, error => console.warn('Monitoramento da sessão indisponível:', error));
        const heartbeat = () => updateDoc(sessionRef, { lastSeenAt: serverTimestamp() }).catch(error => console.warn('Não foi possível atualizar a atividade da sessão:', error));
        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
    }

    window.dashboardSignOut = async () => {
        const sessionId = localStorage.getItem(SESSION_KEY);
        if (sessionId) {
            try {
                await updateDoc(doc(db, 'user_sessions', sessionId), {
                    status: 'revoked', revokedAt: serverTimestamp(), revokedBy: auth.currentUser?.email?.toLowerCase() || 'self'
                });
            } catch (error) { console.warn('Sessão local não pôde ser marcada como encerrada:', error); }
        }
        await leaveDashboard();
    };

    onAuthStateChanged(auth, async user => {
        try {
            if (!user?.email) throw new Error('Sessão não autenticada.');
            const authorizationRef = doc(db, 'usuarios_autorizados', user.email.toLowerCase());
            const authorization = await getDoc(authorizationRef);
            if (!authorization.exists() || authorization.data().status !== 'permitido') {
                await signOut(auth);
                throw new Error('Usuário sem autorização para o painel.');
            }
            const sessionRef = await registerSession(user);
            if (leaving) return;
            watchAccess(authorizationRef, sessionRef);
            localStorage.setItem('user_email', user.email);
            localStorage.setItem('user_nome', user.displayName || user.email);
            window.dashboardAuthorization = {
                ...authorization.data(), email: user.email.toLowerCase(),
                nome: authorization.data().nome || user.displayName || user.email
            };
            window.dispatchEvent(new CustomEvent('dashboard-auth-ready', { detail: window.dashboardAuthorization }));
            document.body.classList.remove('auth-pending');
        } catch (error) {
            console.error('Acesso ao dashboard recusado:', error);
            if (!leaving) await leaveDashboard();
        }
    });
}
