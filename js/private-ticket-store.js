import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, getDocs, getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);

function waitForUser(auth) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            if (user) resolve(user);
            else reject(new Error('Sessão Firebase necessária para acessar chamados privados.'));
        }, reject);
    });
}

async function loadPrivateTickets() {
    if (localDevelopment) return [
        { protocol: 9001, subject: 'Acesso ao sistema', customer: { name: 'Maria Teste', email: 'maria.teste@example.com', organization: { name: 'Unidade Exemplo' } }, priority: 2, creation_date: '2026-08-10 09:30:00-03:00', end_date: null, sla: { deadline: { accomplished: true } }, reopened: false, status: { description: 'Em atendimento' } },
        { protocol: 9002, subject: 'Configuração de estação', customer: { name: 'João Teste', email: 'joao.teste@example.com', organization: { name: 'Unidade Exemplo' } }, priority: 3, creation_date: '2026-08-11 14:15:00-03:00', end_date: null, sla: { deadline: { accomplished: false } }, reopened: false, status: { description: 'Aguardando interação do atendente' } },
        { protocol: 9003, subject: 'Dúvida operacional', customer: { name: 'Maria Teste', email: 'maria.teste@example.com', organization: { name: 'Unidade Exemplo' } }, priority: 2, creation_date: '2026-07-20 10:00:00-03:00', end_date: '2026-07-20 12:00:00-03:00', sla: { deadline: { accomplished: true } }, reopened: false, status: { description: 'Finalizada' } }
    ];
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    await waitForUser(auth);
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, 'tomticket_private'));
    return snapshot.docs
        .filter(item => item.id.startsWith('chunk_'))
        .map(item => item.data())
        .sort((a, b) => Number(a.index) - Number(b.index))
        .flatMap(chunk => {
            try { return JSON.parse(chunk.payload || '[]'); }
            catch { return []; }
        });
}

window.privateTicketStoreReady = loadPrivateTickets();
