import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const format = value => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
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
    renderDimension(currentDimension);
}

function renderDimension(dimension) {
    currentDimension = dimension;
    const records = currentMetrics?.breakdowns?.[dimension] || [];
    const labels = { operators: 'Atendente', categories: 'Categoria', departments: 'Departamento' };
    set('operationalDimensionHeading', labels[dimension]);
    document.querySelectorAll('[data-operational-dimension]').forEach(button => button.classList.toggle('is-active', button.dataset.operationalDimension === dimension));
    const body = document.getElementById('operationalAnalysisBody');
    if (body) body.innerHTML = records.length ? records.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${format(item.volume)}</td><td>${format(item.concluded)} (${format(item.completion_rate)}%)</td><td>${format(item.backlog)}</td><td>${item.sla_deadline_rate == null ? '—' : `${format(item.sla_deadline_rate)}%`}</td><td>${item.mean_first_response_hours == null ? '—' : `${format(item.mean_first_response_hours)}h`}</td><td>${format(item.total_work_hours)}h</td></tr>`).join('') : '<tr><td colspan="7" class="table-empty-state">Ainda não há dados enriquecidos para esta dimensão.</td></tr>';
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
    load().catch(error => console.warn('Métricas enriquecidas indisponíveis.', error));
});
