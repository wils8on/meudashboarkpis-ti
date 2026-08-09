import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const localKey = 'cadastroOrganizacoesDB';

const normalizeClient = client => ({
    id: client.id || null,
    nome: String(client.nome || '').trim(),
    setorAtual: client.setorAtual || 'Não definido',
    unidade: client.unidade || 'Não definido',
    historicoSetores: Array.isArray(client.historicoSetores) ? client.historicoSetores : []
});

const organizationId = name => encodeURIComponent(name.toLocaleLowerCase('pt-BR')).replaceAll('%', '_').slice(0, 300);
const initialClient = name => ({
    nome: name,
    setorAtual: 'Não definido',
    unidade: 'Não definido',
    historicoSetores: [{
        data: new Date().toLocaleString('pt-BR'),
        logs: ['Organização cadastrada pela sincronização sanitizada']
    }]
});

function createLocalStore() {
    const read = () => {
        try {
            return (JSON.parse(localStorage.getItem(localKey)) || []).map(normalizeClient);
        } catch {
            return [];
        }
    };
    const write = clients => localStorage.setItem(localKey, JSON.stringify(clients));

    return {
        async list() {
            return read().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        },
        async seedOrganizations(names) {
            const clients = read();
            const known = new Set(clients.map(client => client.nome.toLocaleLowerCase('pt-BR')));
            names.forEach(name => {
                if (!known.has(name.toLocaleLowerCase('pt-BR'))) clients.push(initialClient(name));
            });
            write(clients);
            return this.list();
        },
        async update(client) {
            const clients = read();
            const index = clients.findIndex(item => item.nome.toLocaleLowerCase('pt-BR') === client.nome.toLocaleLowerCase('pt-BR'));
            if (index >= 0) clients[index] = normalizeClient(client);
            else clients.push(normalizeClient(client));
            write(clients);
            return normalizeClient(client);
        }
    };
}

function waitForUser(auth) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            if (user) resolve(user);
            else reject(new Error('Sessão Firebase necessária para acessar clientes.'));
        }, reject);
    });
}

async function createFirestoreStore() {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const user = await waitForUser(auth);
    const clientsCollection = collection(db, 'clientes');

    const list = async () => {
        const snapshot = await getDocs(query(clientsCollection, where('ownerUid', '==', user.uid)));
        return snapshot.docs
            .map(item => normalizeClient({ id: item.id, ...item.data() }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    };

    return {
        list,
        async seedOrganizations(names) {
            const existing = await list();
            const known = new Set(existing.map(client => client.nome.toLocaleLowerCase('pt-BR')));
            const missing = names.filter(name => !known.has(name.toLocaleLowerCase('pt-BR')));

            await Promise.all(missing.map(async name => {
                const client = initialClient(name);
                await setDoc(doc(clientsCollection, organizationId(name)), {
                    ...client,
                    ownerUid: user.uid,
                    updatedAt: serverTimestamp()
                });
            }));
            return list();
        },
        async update(client) {
            const id = client.id || organizationId(client.nome);
            const normalized = normalizeClient({ ...client, id });
            await setDoc(doc(clientsCollection, id), {
                nome: normalized.nome,
                setorAtual: normalized.setorAtual,
                unidade: normalized.unidade,
                historicoSetores: normalized.historicoSetores,
                ownerUid: user.uid,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return normalized;
        }
    };
}

window.clientStoreReady = localDevelopment
    ? Promise.resolve(createLocalStore())
    : createFirestoreStore();
