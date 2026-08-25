import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const format = value => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
function waitForUser(auth) { return new Promise((resolve, reject) => { const unsubscribe = onAuthStateChanged(auth, user => { unsubscribe(); user ? resolve(user) : reject(new Error('Sessão necessária.')); }, reject); }); }
function render(metrics) {
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
}
async function load() {
    if (local) { render({ coverage: { enriched: 0, total: 3, rate: 0 } }); return; }
    const app = getApps()[0] || initializeApp(firebaseConfig); const auth = getAuth(app); await waitForUser(auth);
    const snapshot = await getDoc(doc(getFirestore(app), 'tomticket_metrics', 'current')); if (!snapshot.exists()) return;
    render(JSON.parse(snapshot.data().payload || '{}'));
}
document.addEventListener('DOMContentLoaded', () => load().catch(error => console.warn('Métricas enriquecidas indisponíveis.', error)));
