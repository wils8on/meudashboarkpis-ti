import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const format = value => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const priorityLabel = value => ({ 1: 'Baixa', 2: 'Normal', 3: 'Alta', 4: 'Urgente' })[Number(value)] || (value == null ? '—' : `Prioridade ${value}`);
let currentMetrics = null;
let dimensionChart = null;
let currentDimension = 'operators';
function waitForUser(auth) { return new Promise((resolve, reject) => { const unsubscribe = onAuthStateChanged(auth, user => { unsubscribe(); user ? resolve(user) : reject(new Error('Sessão necessária.')); }, reject); }); }
function render(metrics) {
    currentMetrics = metrics;
    const coverage = metrics?.coverage || {};
    set('enrichedCoverage', `${format(coverage.enriched)} de ${format(coverage.total)} chamados · ${format(coverage.rate)}% da base`);
    set('enrichedSlaInitialization', metrics?.sla?.initialization?.rate == null ? '—' : `${format(metrics.sla.initialization.rate)}%`);
    set('enrichedSlaContext', `${format(metrics?.sla?.initialization?.compliant)} de ${format(metrics?.sla?.initialization?.eligible)} elegíveis`);
    set('enrichedFirstResponse', metrics?.first_response?.mean_hours == null ? '—' : `${format(metrics.first_response.mean_hours)}h`);
    set('enrichedFirstResponseContext', `Mediana ${metrics?.first_response?.median_hours == null ? '—' : `${format(metrics.first_response.median_hours)}h`} · ${format(metrics?.first_response?.count)} chamados`);
    set('enrichedWorkTime', metrics?.work_time?.mean_hours == null ? '—' : `${format(metrics.work_time.mean_hours)}h`);
    set('enrichedWorkContext', `${format(metrics?.work_time?.total_hours)}h registradas em ${format(metrics?.work_time?.count)} chamados`);
    set('enrichedEvaluation', metrics?.evaluation?.mean_grade == null ? '—' : `${format(metrics.evaluation.mean_grade)}/5`);
    set('enrichedEvaluationContext', `${format(metrics?.evaluation?.count)} avaliação(ões)`);
    set('enrichedInteractions', metrics?.interactions?.mean == null ? '—' : format(metrics.interactions.mean));
    set('enrichedInteractionsContext', `${format(metrics?.interactions?.total || 0)} interações · ${format(metrics?.interactions?.high_touch || 0)} chamados acima de 10`);
    set('enrichedCsatResponse', metrics?.evaluation?.response_rate == null ? '—' : `${format(metrics.evaluation.response_rate)}%`);
    set('enrichedCsatContext', `${format(metrics?.evaluation?.count || 0)} de ${format(metrics?.evaluation?.eligible_concluded || 0)} concluídos · resolvido ${metrics?.evaluation?.problem_solved_rate == null ? '—' : `${format(metrics.evaluation.problem_solved_rate)}%`}`);
    set('enrichedWorkRatio', metrics?.work_time?.effective_ratio == null ? '—' : `${format(metrics.work_time.effective_ratio)}%`);
    set('enrichedWorkRatioContext', `${format(metrics?.work_time?.elapsed_sample || 0)} chamados · ${format(metrics?.work_time?.elapsed_hours || 0)}h decorridas`);
    const backlogTrend = metrics?.trends?.backlog; const historyDays = metrics?.trends?.daily?.length || 0;
    set('smartBacklogDailyDelta', backlogTrend?.delta == null ? '—' : `${backlogTrend.delta > 0 ? '+' : ''}${format(backlogTrend.delta)}`);
    set('smartBacklogDailyContext', historyDays < 2 ? `${historyDays} dia consolidado · aguardando comparação` : `${historyDays} dias consolidados · versus o dia anterior`);
    renderAlerts(metrics?.alerts, coverage);
    renderDimension(currentDimension);
    renderStaleness(metrics?.staleness);
}

function renderAlerts(alerts = {}, coverage = {}) {
    const active = alerts.active || []; const list = document.getElementById('operationalAlertsList');
    set('operationalAlertsCount', active.length ? `${active.length} alerta(s) ativo(s)` : 'Operação dentro das metas avaliadas');
    set('operationalAlertsCoverage', `Avaliação sobre ${format(coverage.enriched || 0)} de ${format(coverage.total || 0)} chamados enriquecidos (${format(coverage.rate || 0)}%).`);
    if (!list) return;
    list.innerHTML = active.length ? active.map(item => `<article class="operational-alert is-${item.severity === 'critical' ? 'critical' : 'warning'}"><i class="fa-solid ${item.severity === 'critical' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div></article>`).join('') : '<div class="operational-alert-empty is-ok"><i class="fa-solid fa-circle-check"></i><span>Nenhuma regra atingiu o limite de alerta nesta amostra.</span></div>';
}

const idleLabel = hours => hours >= 24 ? `${format(hours / 24)} dia(s)` : `${format(hours)}h`;
function populateFilter(id, records, field, label, display = value => value) {
    const element = document.getElementById(id); if (!element) return;
    const selected = element.value; const values = [...new Set(records.map(item => String(item[field] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    element.innerHTML = `<option value="">${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(display(value))}</option>`).join('')}`;
    if (values.includes(selected)) element.value = selected;
}
function renderStaleness(staleness = {}) {
    const records = staleness.records || []; const thresholds = staleness.thresholds || {};
    set('stalenessCoverage', `${format(staleness.eligible || 0)} chamados abertos com movimentação conhecida`);
    set('stale4h', format(thresholds.over_4h || 0)); set('stale8h', format(thresholds.over_8h || 0)); set('stale24h', format(thresholds.over_24h || 0)); set('stale72h', format(thresholds.over_72h || 0));
    populateFilter('stalePriorityFilter', records, 'priority', 'Todas as prioridades', priorityLabel); populateFilter('staleOperatorFilter', records, 'responsible_agent', 'Todos os atendentes'); populateFilter('staleCategoryFilter', records, 'category', 'Todas as categorias'); populateFilter('staleDepartmentFilter', records, 'department', 'Todos os departamentos');
    const filters = { priority: document.getElementById('stalePriorityFilter')?.value, responsible_agent: document.getElementById('staleOperatorFilter')?.value, category: document.getElementById('staleCategoryFilter')?.value, department: document.getElementById('staleDepartmentFilter')?.value };
    const visible = records.filter(item => Object.entries(filters).every(([field, value]) => !value || String(item[field]) === value));
    const body = document.getElementById('stalenessTableBody'); if (!body) return;
    body.innerHTML = visible.length ? visible.map(item => `<tr><td>${escapeHtml(item.protocol || '—')}</td><td class="aging-subject">${escapeHtml(item.subject)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(priorityLabel(item.priority))}</td><td>${escapeHtml(item.responsible_agent)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.department)}</td><td class="aging-days">${idleLabel(item.idle_hours)}</td></tr>`).join('') : '<tr><td colspan="8" class="table-empty-state">Nenhum chamado corresponde aos filtros selecionados.</td></tr>';
}

function renderDimension(dimension) {
    currentDimension = dimension;
    const records = currentMetrics?.breakdowns?.[dimension] || [];
    const labels = { operators: 'Atendente', categories: 'Categoria', departments: 'Departamento', priorities: 'Prioridade' };
    set('operationalDimensionHeading', labels[dimension]);
    document.querySelectorAll('[data-operational-dimension]').forEach(button => button.classList.toggle('is-active', button.dataset.operationalDimension === dimension));
    const body = document.getElementById('operationalAnalysisBody');
    if (body) body.innerHTML = records.length ? records.map(item => { const trend = item.volume_growth_30d; const trendText = trend == null ? '—' : `${trend > 0 ? '+' : ''}${format(trend)}%`; return `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${format(item.volume)}</td><td class="dimension-trend ${trend > 0 ? 'is-up' : trend < 0 ? 'is-down' : ''}">${trendText}<small>${format(item.volume_current_30d)} × ${format(item.volume_previous_30d)}</small></td><td>${format(item.concluded)} (${format(item.completion_rate)}%)</td><td>${format(item.backlog)}</td><td>${item.sla_deadline_rate == null ? '—' : `${format(item.sla_deadline_rate)}%`}</td><td>${item.mean_first_response_hours == null ? '—' : `${format(item.mean_first_response_hours)}h`}</td><td>${format(item.total_work_hours)}h</td><td>${item.work_elapsed_rate == null ? '—' : `${format(item.work_elapsed_rate)}%`}</td><td>${item.mean_interactions == null ? '—' : format(item.mean_interactions)}</td><td>${item.mean_evaluation == null ? '—' : `${format(item.mean_evaluation)}/5 (${format(item.evaluation_count)})`}</td></tr>`; }).join('') : '<tr><td colspan="11" class="table-empty-state">Ainda não há dados enriquecidos para esta dimensão.</td></tr>';
    const canvas = document.getElementById('enrichedDimensionChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (dimensionChart) dimensionChart.destroy();
    const visible = records.slice(0, 12);
    dimensionChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: visible.map(item => item.name), datasets: [
            { label: 'Concluídos', data: visible.map(item => item.concluded), backgroundColor: '#34d399', borderRadius: 4 },
            { label: 'Backlog', data: visible.map(item => item.backlog), backgroundColor: '#f5b942', borderRadius: 4 }
        ] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { beginAtZero: true, stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } }
    });
}
async function load() {
    if (local) { render({ coverage: { enriched: 0, total: 3, rate: 0 } }); return; }
    const app = getApps()[0] || initializeApp(firebaseConfig); const auth = getAuth(app); await waitForUser(auth);
    const snapshot = await getDoc(doc(getFirestore(app), 'tomticket_private', 'metrics')); if (!snapshot.exists()) return;
    render(JSON.parse(snapshot.data().payload || '{}'));
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-operational-dimension]').forEach(button => button.addEventListener('click', () => renderDimension(button.dataset.operationalDimension)));
    ['stalePriorityFilter', 'staleOperatorFilter', 'staleCategoryFilter', 'staleDepartmentFilter'].forEach(id => document.getElementById(id)?.addEventListener('change', () => renderStaleness(currentMetrics?.staleness)));
    load().catch(error => console.warn('Métricas enriquecidas indisponíveis.', error));
});
