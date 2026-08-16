import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const localKey = 'cadastroSolicitantesDB';

const normalizeRequester = requester => ({
    id: requester.id || null,
    nome: String(requester.nome || '').trim(),
    email: String(requester.email || '').trim().toLowerCase(),
    organizacao: String(requester.organizacao || '').trim() || 'Sem organização',
    setorAtual: requester.setorAtual || 'Não definido',
    unidade: requester.unidade || 'Não definido',
    historicoSetores: Array.isArray(requester.historicoSetores) ? requester.historicoSetores : []
});

const requesterKey = requester => requester.email || requester.nome.toLocaleLowerCase('pt-BR');
const requesterId = requester => encodeURIComponent(requesterKey(requester)).replaceAll('%', '_').slice(0, 300);
const initialRequester = requester => ({
    nome: requester.nome,
    email: requester.email || '',
    organizacao: requester.organizacao || 'Sem organização',
    setorAtual: 'Não definido',
    unidade: 'Não definido',
    historicoSetores: [{ data: new Date().toLocaleString('pt-BR'), logs: ['Solicitante cadastrado pela sincronização privada do TomTicket'] }]
});

function createLocalStore() {
    const read = () => {
        try { return (JSON.parse(localStorage.getItem(localKey)) || []).map(normalizeRequester); }
        catch { return []; }
    };
    const write = requesters => localStorage.setItem(localKey, JSON.stringify(requesters));
    return {
        async list() { return read().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); },
        async seedRequesters(incoming) {
            const requesters = read();
            const known = new Set(requesters.map(requesterKey));
            incoming.forEach(item => {
                const normalized = normalizeRequester(item);
                if (normalized.nome && !known.has(requesterKey(normalized))) requesters.push(initialRequester(normalized));
            });
            write(requesters);
            return this.list();
        },
        async update(requester) {
            const requesters = read();
            const normalized = normalizeRequester(requester);
            const index = requesters.findIndex(item => requesterKey(item) === requesterKey(normalized));
            if (index >= 0) requesters[index] = normalized;
            else requesters.push(normalized);
            write(requesters);
            return normalized;
        }
    };
}

function waitForUser(auth) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            if (user) resolve(user);
            else reject(new Error('Sessão Firebase necessária para acessar solicitantes.'));
        }, reject);
    });
}

async function createFirestoreStore() {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    await waitForUser(auth);
    const requestersCollection = collection(db, 'solicitantes');
    const list = async () => {
        const snapshot = await getDocs(requestersCollection);
        return snapshot.docs.map(item => normalizeRequester({ id: item.id, ...item.data() })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    };

    return {
        list,
        async seedRequesters(incoming) {
            const existing = await list();
            if (window.dashboardAuthorization?.role !== 'admin') return existing;
            const known = new Set(existing.map(requesterKey));
            const missing = incoming.map(normalizeRequester).filter(item => item.nome && !known.has(requesterKey(item)));
            await Promise.all(missing.map(async item => {
                const requester = initialRequester(item);
                await setDoc(doc(requestersCollection, requesterId(requester)), { ...requester, updatedAt: serverTimestamp() });
            }));
            return list();
        },
        async update(requester) {
            if (window.dashboardAuthorization?.role !== 'admin') throw new Error('Somente administradores podem alterar setores.');
            const normalized = normalizeRequester(requester);
            const id = normalized.id || requesterId(normalized);
            await setDoc(doc(requestersCollection, id), {
                nome: normalized.nome,
                email: normalized.email,
                organizacao: normalized.organizacao,
                setorAtual: normalized.setorAtual,
                unidade: normalized.unidade,
                historicoSetores: normalized.historicoSetores,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return { ...normalized, id };
        }
    };
}

window.clientStoreReady = localDevelopment ? Promise.resolve(createLocalStore()) : createFirestoreStore();
