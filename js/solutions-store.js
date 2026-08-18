import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const localKey = 'solucoesDesenvolvidasDB';
const editableFields = ['nome', 'motivo', 'objetivo', 'setor', 'responsavelNome', 'responsavelId', 'tipo', 'status', 'data', 'querySql', 'numeroComunicado'];

const clean = value => String(value ?? '').trim();
const normalizeSolution = solution => ({
    id: clean(solution.id),
    sourceKey: clean(solution.sourceKey),
    nome: clean(solution.nome),
    motivo: clean(solution.motivo),
    objetivo: clean(solution.objetivo),
    setor: clean(solution.setor) || 'Não informado',
    responsavelNome: clean(solution.responsavelNome) || 'Não informado',
    responsavelId: clean(solution.responsavelId),
    tipo: clean(solution.tipo) || 'Não informado',
    status: clean(solution.status) || 'Não informado',
    data: clean(solution.data),
    querySql: clean(solution.querySql),
    numeroComunicado: clean(solution.numeroComunicado),
    historico: Array.isArray(solution.historico) ? solution.historico : [],
    createdAt: solution.createdAt || null,
    updatedAt: solution.updatedAt || null,
});

function differences(previous, next) {
    return editableFields.flatMap(field => clean(previous?.[field]) === clean(next?.[field]) ? [] : [{ field, de: clean(previous?.[field]), para: clean(next?.[field]) }]);
}

function historyEntry(action, changes, source) {
    return {
        data: new Date().toISOString(),
        acao: action,
        usuario: localDevelopment ? 'Administrador local' : (window.dashboardAuthorization?.email || 'Administrador'),
        origem: source || 'Painel',
        alteracoes: changes,
    };
}

function withHistory(previous, next, action, source) {
    const changes = differences(previous, next);
    if (!changes.length) return { record: previous, changed: false };
    const history = [...(previous?.historico || []), historyEntry(action, changes, source)].slice(-150);
    return { record: normalizeSolution({ ...previous, ...next, historico: history }), changed: true };
}

function createLocalStore() {
    const read = () => {
        try { return (JSON.parse(localStorage.getItem(localKey)) || []).map(normalizeSolution); }
        catch { return []; }
    };
    const write = records => localStorage.setItem(localKey, JSON.stringify(records));
    return {
        async list() { return read(); },
        async import(records, metadata) {
            const current = read();
            const byId = new Map(current.map(item => [item.id, item]));
            let created = 0, updated = 0, unchanged = 0;
            const updatedRecords = [];
            records.forEach(incoming => {
                incoming = normalizeSolution(incoming);
                const previous = byId.get(incoming.id);
                if (!previous) {
                    created += 1;
                    byId.set(incoming.id, normalizeSolution({ ...incoming, historico: [historyEntry('Importação inicial', [{ field: 'registro', de: '', para: 'Criado' }], metadata.fileName)] }));
                    return;
                }
                const result = withHistory(previous, incoming, 'Atualização por importação', metadata.fileName);
                if (result.changed) { updated += 1; updatedRecords.push({ nome: incoming.nome, alteracoes: differences(previous, incoming) }); byId.set(incoming.id, result.record); }
                else unchanged += 1;
            });
            write([...byId.values()]);
            return { created, updated, unchanged, total: records.length, updatedRecords };
        },
        async update(id, changes) {
            const current = read();
            const index = current.findIndex(item => item.id === id);
            if (index < 0) throw new Error('Solução não encontrada.');
            const result = withHistory(current[index], { ...current[index], ...changes }, 'Edição manual', 'Painel');
            current[index] = result.record;
            write(current);
            return result.record;
        }
    };
}

function waitForUser(auth) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            if (user) resolve(user);
            else reject(new Error('Sessão Firebase necessária para acessar as soluções.'));
        }, reject);
    });
}

async function createFirestoreStore() {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    await waitForUser(auth);
    const solutionsCollection = collection(db, 'solucoes_desenvolvidas');
    const list = async () => {
        const snapshot = await getDocs(solutionsCollection);
        return snapshot.docs.map(item => normalizeSolution({ id: item.id, ...item.data() }));
    };
    const requireAdmin = () => {
        if (window.dashboardAuthorization?.role !== 'admin') throw new Error('Somente administradores podem alterar as soluções.');
    };
    return {
        list,
        async import(records, metadata) {
            requireAdmin();
            const current = await list();
            const byId = new Map(current.map(item => [item.id, item]));
            const writes = [];
            let created = 0, updated = 0, unchanged = 0;
            const updatedRecords = [];
            records.forEach(incoming => {
                incoming = normalizeSolution(incoming);
                const previous = byId.get(incoming.id);
                if (!previous) {
                    created += 1;
                    writes.push(normalizeSolution({ ...incoming, historico: [historyEntry('Importação inicial', [{ field: 'registro', de: '', para: 'Criado' }], metadata.fileName)] }));
                    return;
                }
                const result = withHistory(previous, incoming, 'Atualização por importação', metadata.fileName);
                if (result.changed) { updated += 1; updatedRecords.push({ nome: incoming.nome, alteracoes: differences(previous, incoming) }); writes.push(result.record); }
                else unchanged += 1;
            });
            for (let offset = 0; offset < writes.length; offset += 400) {
                const batch = writeBatch(db);
                writes.slice(offset, offset + 400).forEach(record => batch.set(doc(solutionsCollection, record.id), { ...record, updatedAt: serverTimestamp(), createdAt: record.createdAt || serverTimestamp() }, { merge: true }));
                await batch.commit();
            }
            return { created, updated, unchanged, total: records.length, updatedRecords };
        },
        async update(id, changes) {
            requireAdmin();
            const current = (await list()).find(item => item.id === id);
            if (!current) throw new Error('Solução não encontrada.');
            const result = withHistory(current, { ...current, ...changes }, 'Edição manual', 'Painel');
            if (!result.changed) return current;
            const batch = writeBatch(db);
            batch.set(doc(solutionsCollection, id), { ...result.record, updatedAt: serverTimestamp() }, { merge: true });
            await batch.commit();
            return result.record;
        }
    };
}

window.solutionsStoreReady = localDevelopment ? Promise.resolve(createLocalStore()) : createFirestoreStore();
