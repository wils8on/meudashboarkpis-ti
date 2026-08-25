import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const localConfigKey = 'tomticket-operational-goals-dev';
const localHistoryKey = 'tomticket-operational-goals-history-dev';
const configDocument = 'operational_alerts';
let authorization = window.dashboardAuthorization || null;
const app = local ? null : (getApps()[0] || initializeApp(firebaseConfig));
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
let currentConfig = null;
let initialized = false;

const labels = {
    'sla_deadline.minimum_rate': 'Meta mínima de SLA', 'sla_deadline.minimum_sample': 'Amostra mínima de SLA', 'sla_deadline.enabled': 'Alerta de SLA',
    'enriched_backlog.maximum_count': 'Limite de backlog', 'enriched_backlog.minimum_coverage_rate': 'Cobertura mínima do backlog', 'enriched_backlog.enabled': 'Alerta de backlog',
    'reopen_rate.maximum_rate': 'Taxa máxima de reabertura', 'reopen_rate.minimum_sample': 'Amostra mínima de reabertura', 'reopen_rate.enabled': 'Alerta de reabertura',
    'critical_staleness.hours': 'Horas sem movimentação', 'critical_staleness.maximum_count': 'Quantidade parada tolerada', 'critical_staleness.enabled': 'Alerta sem movimentação',
    'continuous_backlog_growth.consecutive_days': 'Dias de crescimento contínuo', 'continuous_backlog_growth.enabled': 'Alerta de crescimento contínuo',
    'department_volume_anomaly.maximum_growth_rate': 'Crescimento máximo por departamento', 'department_volume_anomaly.minimum_previous_volume': 'Volume anterior mínimo', 'department_volume_anomaly.minimum_coverage_rate': 'Cobertura mínima departamental', 'department_volume_anomaly.enabled': 'Alerta de anomalia departamental'
};

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const getPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => { const keys = path.split('.'); const last = keys.pop(); const target = keys.reduce((item, key) => item[key] ||= {}, object); target[last] = value; };
const localHistory = () => JSON.parse(localStorage.getItem(localHistoryKey) || '[]');

function status(message, state = '') { const element = document.getElementById('operationalGoalsStatus'); if (element) { element.textContent = message; element.dataset.state = state; } }
function timestamp(value) { if (!value) return null; if (typeof value.toDate === 'function') return value.toDate(); const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function formatValue(value) { if (typeof value === 'boolean') return value ? 'Ativo' : 'Inativo'; return String(value ?? '—'); }

async function defaultConfig() {
    const response = await fetch('config/operational-alerts.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuração padrão indisponível.');
    return response.json();
}

function fillForm(config) {
    const form = document.getElementById('operationalGoalsForm');
    form?.querySelectorAll('[name]').forEach(input => { const value = getPath(config.rules, input.name); if (input.type === 'checkbox') input.checked = value === true; else input.value = value ?? ''; });
}

function readForm() {
    const rules = {}; const form = document.getElementById('operationalGoalsForm');
    form.querySelectorAll('[name]').forEach(input => setPath(rules, input.name, input.type === 'checkbox' ? input.checked : Number(input.value)));
    return rules;
}

function changesBetween(before = {}, after = {}) {
    return Object.keys(labels).flatMap(path => { const previous = getPath(before.rules, path); const next = getPath(after.rules, path); return previous === next ? [] : [{ field: path, label: labels[path], before: previous ?? null, after: next ?? null }]; });
}

async function loadConfig() {
    const fallback = await defaultConfig();
    if (local) return JSON.parse(localStorage.getItem(localConfigKey) || 'null') || fallback;
    const snapshot = await getDoc(doc(db, 'tomticket_config', configDocument));
    return snapshot.exists() ? snapshot.data() : fallback;
}

async function loadHistory() {
    if (local) return localHistory();
    const snapshot = await getDocs(query(collection(db, 'tomticket_config_history'), orderBy('createdAt', 'desc'), limit(50)));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

function renderHistory(records) {
    const body = document.getElementById('operationalGoalsHistory'); if (!body) return;
    body.innerHTML = records.length ? records.map(record => {
        const date = timestamp(record.createdAt); const changes = Array.isArray(record.changes) ? record.changes : [];
        const list = changes.map(change => `<li><strong>${escapeHtml(change.label || change.field)}:</strong> ${escapeHtml(formatValue(change.before))} → ${escapeHtml(formatValue(change.after))}</li>`).join('');
        return `<tr><td>${date ? date.toLocaleString('pt-BR') : '—'}</td><td>${escapeHtml(record.updatedByName || record.updatedBy || 'Administrador')}</td><td>v${escapeHtml(record.version || '—')}</td><td><ul class="goals-change-list">${list || '<li>Configuração inicial</li>'}</ul></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="table-empty-state">Nenhuma alteração registrada.</td></tr>';
}

async function refresh() {
    status('Carregando metas...');
    currentConfig = await loadConfig(); fillForm(currentConfig); renderHistory(await loadHistory());
    status(`Configuração v${currentConfig.version || 1} carregada.`, 'success');
}

async function save(event) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const rules = readForm(); const next = { ...currentConfig, version: Number(currentConfig?.version || 0) + 1, rules };
    const changes = changesBetween(currentConfig, next); if (!changes.length) { status('Nenhuma alteração para salvar.'); return; }
    const email = auth?.currentUser?.email?.toLowerCase() || authorization?.email || 'admin@localhost';
    const name = authorization?.nome || email;
    try {
        status('Salvando metas...'); document.getElementById('operationalGoalsSave').disabled = true;
        if (local) {
            const now = new Date().toISOString(); const saved = { ...next, updatedAt: now, updatedBy: email, updatedByName: name };
            localStorage.setItem(localConfigKey, JSON.stringify(saved)); localStorage.setItem(localHistoryKey, JSON.stringify([{ createdAt: now, updatedBy: email, updatedByName: name, version: next.version, changes }, ...localHistory()].slice(0, 50)));
        } else {
            const batch = writeBatch(db); const historyRef = doc(collection(db, 'tomticket_config_history'));
            batch.set(doc(db, 'tomticket_config', configDocument), { ...next, updatedAt: serverTimestamp(), updatedBy: email, updatedByName: name });
            batch.set(historyRef, { configId: configDocument, version: next.version, changes, createdAt: serverTimestamp(), updatedBy: email, updatedByName: name });
            await batch.commit();
        }
        await refresh(); status(`Metas salvas na versão ${next.version}. Serão aplicadas na próxima sincronização.`, 'success');
    } catch (error) { console.error('Falha ao salvar metas:', error); status('Não foi possível salvar. Confirme o acesso administrativo e as regras do Firestore.', 'error'); }
    finally { document.getElementById('operationalGoalsSave').disabled = false; }
}

async function initialize(detail) {
    authorization = detail || authorization; if (authorization?.role !== 'admin' || initialized) return; initialized = true;
    document.getElementById('adminGoalsNav').hidden = false;
    document.getElementById('operationalGoalsForm')?.addEventListener('submit', save);
    document.getElementById('operationalGoalsRefresh')?.addEventListener('click', () => refresh().catch(error => { console.error(error); status('Não foi possível atualizar as metas.', 'error'); }));
    try { await refresh(); } catch (error) { console.error('Falha ao carregar metas:', error); status('Não foi possível carregar as metas.', 'error'); }
}

window.addEventListener('dashboard-auth-ready', event => initialize(event.detail), { once: true });
if (authorization) initialize(authorization);
