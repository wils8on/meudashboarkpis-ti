// ==========================================
// 1. GUARDA DE SEGURANÇA, LOGOUT, TEMA & EXPORTAÇÃO EXECUTIVA PDF
// ==========================================
if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    document.body.classList.remove('auth-pending');
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', async function() {
        localStorage.removeItem('logado');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_nome');
        if (typeof window.dashboardSignOut === 'function') {
            await window.dashboardSignOut();
        } else {
            window.location.href = 'index.html';
        }
    });
}

// Aciona o motor de impressão nativo configurado via CSS corporativo (@media print)
document.addEventListener('DOMContentLoaded', () => {
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnPDF) {
        btnPDF.addEventListener('click', function() {
            window.print();
        });
    }
});

// Inicialização do Tema
document.addEventListener('DOMContentLoaded', () => {
    const temaSalvo = localStorage.getItem('dashboard-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', temaSalvo);
    configurarPadraoDosGraficos();

    const nomeUsuario = localStorage.getItem('user_nome');
    const userNameElement = document.querySelector('.user-profile strong');
    if (nomeUsuario && userNameElement) {
        userNameElement.textContent = nomeUsuario.split(' ')[0];
    }
});

window.alternarModoTema = function() {
    const temaAtual = document.documentElement.getAttribute('data-theme');
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', novoTema);
    localStorage.setItem('dashboard-theme', novoTema);
    configurarPadraoDosGraficos();
    
    if (dadosPlanilhaGlobal.length > 0) {
        processarIndicadoresEstrategicos();
    }
};

function obterCorTextoPorTema() {
    const temaAtivo = document.documentElement.getAttribute('data-theme');
    return temaAtivo === 'dark' ? '#cbd5e1' : '#475569';
}

function obterCorGridPorTema() {
    const temaAtivo = document.documentElement.getAttribute('data-theme');
    return temaAtivo === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
}

function configurarPadraoDosGraficos() {
    if (typeof Chart === 'undefined') return;
    const temaEscuro = document.documentElement.getAttribute('data-theme') !== 'light';
    Chart.defaults.color = temaEscuro ? '#9a96b8' : '#6b6684';
    Chart.defaults.font.family = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420;
    Chart.defaults.interaction.mode = 'index';
    Chart.defaults.interaction.intersect = false;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.boxWidth = 7;
    Chart.defaults.plugins.legend.labels.boxHeight = 7;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = temaEscuro ? 'rgba(23, 20, 38, .96)' : 'rgba(255, 255, 255, .98)';
    Chart.defaults.plugins.tooltip.titleColor = temaEscuro ? '#f3f1fb' : '#211e33';
    Chart.defaults.plugins.tooltip.bodyColor = temaEscuro ? '#d5d1e6' : '#4f4a66';
    Chart.defaults.plugins.tooltip.borderColor = temaEscuro ? 'rgba(255,255,255,.16)' : 'rgba(90,70,150,.18)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.tooltip.padding = 11;
}

// ==========================================
// 2. SISTEMA DE NAVEGAÇÃO (MENU LATERAL)
// ==========================================
const menuItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.tab-content');

menuItems.forEach(item => {
    const itemLabelInicial = item.querySelector('span')?.textContent.trim();
    if (itemLabelInicial) {
        item.title = itemLabelInicial;
        item.setAttribute('aria-label', itemLabelInicial);
    }
    item.setAttribute('aria-current', item.classList.contains('active') ? 'page' : 'false');

    item.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetSectionId = this.getAttribute('data-target');
        const targetTarget = document.getElementById(targetSectionId);
        
        if (targetTarget) {
            menuItems.forEach(i => {
                i.classList.remove('active');
                i.setAttribute('aria-current', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-current', 'page');
            
            tabs.forEach(tab => tab.classList.remove('active'));
            targetTarget.classList.add('active');

            const pageTitle = document.getElementById('pageTitle');
            const itemLabel = this.querySelector('span');
            if (pageTitle && itemLabel) {
                pageTitle.textContent = itemLabel.textContent.trim();
            }
            
            if (targetSectionId === 'aba-usuarios') {
                renderizarTabelaUsuarios();
            }
            if (targetSectionId === 'aba-solucoes' && typeof window.renderSolutionsDashboard === 'function') {
                window.renderSolutionsDashboard();
            }
        }
    });
});

// ==========================================
// 3. AUXILIARES E CONVERSORES DE DATA
// ==========================================
function tratarFormatoDataExcel(dataInput) {
    if (!dataInput) return null;
    if (dataInput instanceof Date && !isNaN(dataInput.getTime())) return dataInput;
    
    if (typeof dataInput === 'number' || !isNaN(Number(dataInput))) {
        const numeroSerial = Number(dataInput);
        return new Date((numeroSerial - 25569) * 86400 * 1000);
    }
    
    let dataStr = String(dataInput).trim();
    
    // Trata o formato da API do TomTicket: "2026-07-16 16:40:25-03:00"
    if (dataStr.includes('-') && dataStr.includes(':')) {
        if (dataStr.lastIndexOf('-') > 10) {
            dataStr = dataStr.substring(0, dataStr.lastIndexOf('-'));
        } else if (dataStr.includes('+')) {
            dataStr = dataStr.substring(0, dataStr.lastIndexOf('+'));
        }
        dataStr = dataStr.replace(' ', 'T');
        const dTentativaISO = new Date(dataStr);
        if (!isNaN(dTentativaISO.getTime())) return dTentativaISO;
    }
    
    const dataTentativa = new Date(dataStr);
    if (!isNaN(dataTentativa.getTime())) return dataTentativa;
    
    if (dataStr.includes('/')) {
        const partesEspaco = dataStr.split(' ');
        const [dia, mes, ano] = partesEspaco[0].split('/');
        let hora = 0, minuto = 0;
        if (partesEspaco[1] && partesEspaco[1].includes(':')) {
            [hora, minuto] = partesEspaco[1].split(':').map(Number);
        }
        return new Date(Number(ano), Number(mes) - 1, Number(dia), hora, minuto);
    }
    
    return null;
}

// ==========================================
// 4. MEMÓRIA GLOBAL E INSTÂNCIAS DOS GRÁFICOS
// ==========================================
let dadosPlanilhaGlobal = [];
let dadosBrutosAPI = null; 
let chartGeralReal = null;
let chartLinhaResolucao = null;
let chartSlaMensal = null;
let chartBacklogEvolucao = null;
let chartBacklogDistribuicao = null;
let chartAging = null;
let chartReabertosMes = null;
let chartReabertosCliente = null;
let chartDiaHora = null; // Nova instância global para o gráfico multidimensional
let chartDemandasSetor = null;

document.addEventListener('DOMContentLoaded', () => {
    const descricoesGraficos = {
        graficoGeral: 'Gráfico de chamados criados e chamados urgentes por mês',
        graficoDiaHora: 'Gráfico de volumetria por dia da semana e hora de abertura',
        graficoReabertosMes: 'Gráfico da quantidade de chamados reabertos por mês',
        graficoReabertosCliente: 'Ranking de solicitantes por quantidade de chamados',
        graficoLinhaResolucao: 'Gráfico da taxa de resolução mensal',
        graficoSlaMensal: 'Gráfico do cumprimento de SLA por mês',
        graficoBacklogEvolucao: 'Gráfico da evolução de conclusão do backlog',
        graficoBacklogDistribuicao: 'Gráfico da distribuição do backlog atual',
        graficoAging: 'Gráfico de chamados abertos por faixa de aging',
        graficoDemandasSetor: 'Gráfico da quantidade de chamados abertos por setor'
    };

    Object.entries(descricoesGraficos).forEach(([id, descricao]) => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', descricao);
        canvas.tabIndex = 0;
    });
});

function inicializarGraficoGeral(labels = [], dadosTotal = [], dadosUrgentes = []) {
    const ctx = document.getElementById('graficoGeral');
    if (!ctx) return;
    if (chartGeralReal) chartGeralReal.destroy();

    const corTexto = obterCorTextoPorTema();

    chartGeralReal = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: labels,
            datasets: [
                { label: 'Total de Chamados', data: dadosTotal, backgroundColor: '#3b82f6', borderRadius: 4 },
                { label: 'Chamados Urgentes', data: dadosUrgentes, backgroundColor: '#ef4444', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, grace: '10%', ticks: { color: corTexto } },
                x: { ticks: { color: corTexto } }
            },
            plugins: {
                legend: { labels: { color: corTexto } },
                datalabels: {
                    anchor: 'end', align: 'top', color: corTexto,
                    font: { weight: 'bold', size: 11 },
                    formatter: value => value > 0 ? value : ''
                }
            }
        }
    });
}

function inicializarGraficoDiaHora(matrizDados = {}) {
    const ctx = document.getElementById('graficoDiaHora');
    if (!ctx) return;
    if (chartDiaHora) chartDiaHora.destroy();

    const corTexto = obterCorTextoPorTema();
    const corGrid = obterCorGridPorTema();

    // Cria as 24 horas fixas para o eixo X (00h às 23h)
    const horasLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

    const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const coresDias = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

    const datasets = diasSemana.map((dia, idx) => ({
        label: dia,
        data: Array.from({ length: 24 }, (_, h) => matrizDados[idx]?.[h] || 0),
        borderColor: coresDias[idx],
        backgroundColor: coresDias[idx],
        borderWidth: 2.5,
        pointRadius: 2,
        fill: false,
        tension: 0.2
    }));

    chartDiaHora = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels: horasLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: corTexto }, grid: { color: corGrid } },
                x: { ticks: { color: corTexto }, grid: { color: corGrid } }
            },
            plugins: {
                legend: { position: 'top', labels: { color: corTexto, boxWidth: 12 } },
                datalabels: { display: false } // Desativa os labels em cima dos pontos para não poluir
            }
        }
    });
}

function inicializarGraficosPerformance(labels = [], taxasResolucao = [], indicesSla = []) {
    const ctxLinha = document.getElementById('graficoLinhaResolucao');
    const ctxBarra = document.getElementById('graficoSlaMensal');
    const corTexto = obterCorTextoPorTema();

    if (ctxLinha) {
        if (chartLinhaResolucao) chartLinhaResolucao.destroy();
        chartLinhaResolucao = new Chart(ctxLinha.getContext('2d'), {
            type: 'line',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Taxa de Eficiência Mensal (%)',
                    data: taxasResolucao,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.2,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, max: 100, ticks: { color: corTexto } },
                    x: { ticks: { color: corTexto } }
                },
                plugins: {
                    legend: { labels: { color: corTexto } },
                    datalabels: {
                        anchor: 'end', align: 'top', color: '#10b981',
                        font: { weight: 'bold', size: 11 },
                        formatter: value => value > 0 ? `${value.toFixed(2).replace('.', ',')}%` : '0,00%'
                    }
                }
            }
        });
    }

    if (ctxBarra) {
        if (chartSlaMensal) chartSlaMensal.destroy();
        chartSlaMensal = new Chart(ctxBarra.getContext('2d'), {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: '% SLA Cumprido no Mês',
                    data: indicesSla,
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, max: 100, ticks: { color: corTexto } },
                    x: { ticks: { color: corTexto } }
                },
                plugins: {
                    legend: { labels: { color: corTexto } },
                    datalabels: {
                        anchor: 'end', align: 'top', color: '#8b5cf6',
                        font: { weight: 'bold', size: 11 },
                        formatter: value => value > 0 ? `${value.toFixed(2).replace('.', ',')}%` : '0,00%'
                    }
                }
            }
        });
    }
}

function inicializarGraficosBacklog(labels = [], dadosEstoqueInicial = [], dadosFinalizadosNoMes = []) {
    const ctxLinhaDist = document.getElementById('graficoBacklogDistribuicao');
    const ctxBarraEvolucao = document.getElementById('graficoBacklogEvolucao');
    const corTexto = obterCorTextoPorTema();

    if (ctxLinhaDist) {
        if (chartBacklogDistribuicao) chartBacklogDistribuicao.destroy();
        chartBacklogDistribuicao = new Chart(ctxLinhaDist.getContext('2d'), {
            type: 'line',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Distribuição de Backlog (Iniciado no Mês)',
                    data: dadosEstoqueInicial,
                    borderColor: '#7092be',
                    backgroundColor: '#7092be',
                    pointBackgroundColor: '#7092be',
                    pointRadius: 6,
                    fill: false,
                    tension: 0.1,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, grace: '15%', ticks: { color: corTexto } },
                    x: { ticks: { color: corTexto } }
                },
                plugins: {
                    legend: { labels: { color: corTexto } },
                    datalabels: {
                        anchor: 'center', align: 'center', color: 'white',
                        font: { weight: 'bold', size: 10 },
                        backgroundColor: '#7092be', borderRadius: 10, padding: 4,
                        formatter: value => value
                    }
                }
            }
        });
    }

    if (ctxBarraEvolucao) {
        if (chartBacklogEvolucao) chartBacklogEvolucao.destroy();
        chartBacklogEvolucao = new Chart(ctxBarraEvolucao.getContext('2d'), {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade de Backlogs Finalizados',
                    data: dadosFinalizadosNoMes,
                    backgroundColor: '#e6b441',
                    borderRadius: 2,
                    barPercentage: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, grace: '15%', ticks: { color: corTexto } },
                    x: { ticks: { color: corTexto } }
                },
                plugins: {
                    legend: { labels: { color: corTexto } },
                    datalabels: {
                        anchor: 'end', align: 'top', color: corTexto,
                        font: { weight: 'bold', size: 11 },
                        formatter: value => value > 0 ? value : '0'
                    }
                }
            }
        });
    }
}

function inicializarGraficoAging(valoresBuckets = []) {
    const ctx = document.getElementById('graficoAging');
    if (!ctx) return;
    if (chartAging) chartAging.destroy();

    const corTexto = obterCorTextoPorTema();

    chartAging = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: ['0-3 dias', '4-7 dias', '8-15 dias', '16-30 dias', '+30 dias'],
            datasets: [{
                label: 'Quantidade de Chamados',
                data: valoresBuckets,
                backgroundColor: '#7dd3fc',
                borderRadius: 2,
                barPercentage: 0.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grace: '15%', ticks: { color: corTexto } },
                x: { ticks: { color: corTexto } }
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: corTexto,
                    font: { weight: 'bold', size: 11 },
                    formatter: value => value > 0 ? value : '0'
                }
            }
        }
    });
}

function inicializarGraficoReabertosMes(labels = [], dadosReabertos = []) {
    const ctx = document.getElementById('graficoReabertosMes');
    if (!ctx) return;
    if (chartReabertosMes) chartReabertosMes.destroy();

    const corTexto = obterCorTextoPorTema();
    const corGrid = obterCorGridPorTema();

    chartReabertosMes = new Chart(ctx.getContext('2d'), {
        type: 'line',
        plugins: [ChartDataLabels],
        data: {
            labels: labels,
            datasets: [{
                label: 'Chamados Reabertos',
                data: dadosReabertos,
                borderColor: '#f43f5e',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                pointBackgroundColor: '#f43f5e',
                fill: true,
                tension: 0.2,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grace: '15%', ticks: { color: corTexto }, grid: { color: corGrid } },
                x: { ticks: { color: corTexto }, grid: { color: corGrid } }
            },
            plugins: {
                legend: { labels: { color: corTexto } },
                datalabels: {
                    anchor: 'end', align: 'top', color: '#f43f5e',
                    font: { weight: 'bold', size: 11 },
                    formatter: value => value > 0 ? value : '0'
                }
            }
        }
    });
}

function inicializarGraficoReabertosCliente(labels = [], dadosClientes = []) {
    const ctx = document.getElementById('graficoReabertosCliente');
    if (!ctx) return;
    if (chartReabertosCliente) chartReabertosCliente.destroy();

    const corTexto = obterCorTextoPorTema();
    const corGrid = obterCorGridPorTema();

    chartReabertosCliente = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: labels,
            datasets: [{
                label: 'Chamados por Solicitante',
                data: dadosClientes,
                backgroundColor: '#fb923c',
                borderRadius: 2,
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, grace: '15%', ticks: { color: corTexto }, grid: { color: corGrid } },
                y: { ticks: { color: corTexto }, grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'right', color: corTexto,
                    font: { weight: 'bold', size: 11 },
                    formatter: value => value > 0 ? value : '0'
                }
            }
        }
    });
}

// ==========================================
// 5. CONEXÃO SEGURA AUTOMÁTICA VIA JSON ATUALIZADO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    carregarDadosAutomatizados();
});

let eventoInstalacaoPWA = null;

window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    eventoInstalacaoPWA = evento;
});

window.addEventListener('appinstalled', () => {
    eventoInstalacaoPWA = null;
    const botao = document.getElementById('btnInstalarPWA');
    if (botao) botao.hidden = true;
});

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('PWA indisponível:', error));
    }

    const botao = document.getElementById('btnInstalarPWA');
    if (!botao) return;
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        botao.hidden = true;
        return;
    }

    botao.addEventListener('click', async () => {
        if (eventoInstalacaoPWA) {
            await eventoInstalacaoPWA.prompt();
            await eventoInstalacaoPWA.userChoice;
            eventoInstalacaoPWA = null;
            return;
        }
        const mensagem = /iphone|ipad|ipod/i.test(navigator.userAgent)
            ? 'No iPhone ou iPad, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
            : 'Abra o menu do navegador e selecione “Instalar aplicativo” ou “Adicionar à tela inicial”.';
        window.alert(mensagem);
    });
});

function contarDiasDaSemanaNoPeriodo(inicio, fim) {
    const contagem = Array(7).fill(0);
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 12);
    const limite = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 12);
    while (cursor <= limite) {
        contagem[cursor.getDay()]++;
        cursor.setDate(cursor.getDate() + 1);
    }
    return contagem;
}

function inicializarGraficoDemandasSetor(labels = [], valores = []) {
    const ctx = document.getElementById('graficoDemandasSetor');
    if (!ctx) return;
    if (chartDemandasSetor) chartDemandasSetor.destroy();
    const corTexto = obterCorTextoPorTema();
    const corGrid = obterCorGridPorTema();
    chartDemandasSetor = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: { labels, datasets: [{ label: 'Chamados por Setor', data: valores, backgroundColor: '#4ee1c1', borderRadius: 5 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { color: corTexto }, grid: { color: corGrid } }, y: { ticks: { color: corTexto }, grid: { display: false } } },
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'right', color: corTexto, font: { weight: 'bold', size: 10 }, formatter: value => value } }
        }
    });
}

function renderizarTabelaAging(detalhes = []) {
    const body = document.getElementById('agingTableBody');
    const count = document.getElementById('agingTableCount');
    if (!body) return;
    const ordenados = [...detalhes].sort((a, b) => b.dias - a.dias);
    if (count) count.textContent = `${ordenados.length.toLocaleString('pt-BR')} chamados`;
    if (!ordenados.length) {
        body.innerHTML = '<tr><td colspan="4" class="table-empty-state">Nenhum chamado aberto encontrado no período.</td></tr>';
        return;
    }
    const possuiDetalhesPrivados = ordenados.some(item => item.protocolo || item.assunto);
    if (!possuiDetalhesPrivados) {
        body.innerHTML = '<tr><td colspan="4" class="table-empty-state">Aguardando a primeira sincronização da camada privada para exibir protocolo, título e solicitante.</td></tr>';
        return;
    }
    body.innerHTML = ordenados.map(item => `
        <tr>
            <td><span class="table-badge">${escaparHTML(item.protocolo || '—')}</span></td>
            <td class="aging-subject">${escaparHTML(item.assunto || 'Sem título')}</td>
            <td>${escaparHTML(item.solicitante || 'Não identificado')}</td>
            <td class="aging-days">${item.dias.toLocaleString('pt-BR')} dia(s)</td>
        </tr>
    `).join('');
}

function selecionarJanelasTranquilas(matrizDados, inicio, fim, limite = 2) {
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const horasElegiveis = [9, 10, 11, 14, 15, 16];
    const ocorrencias = contarDiasDaSemanaNoPeriodo(inicio, fim);
    const candidatos = [];

    for (let dia = 1; dia <= 5; dia++) {
        if (!ocorrencias[dia]) continue;
        for (const hora of horasElegiveis) {
            const volume = matrizDados[dia]?.[hora] || 0;
            candidatos.push({ dia, hora, media: volume / ocorrencias[dia] });
        }
    }

    candidatos.sort((a, b) => a.media - b.media || a.dia - b.dia || a.hora - b.hora);
    const selecionados = [];
    for (const candidato of candidatos) {
        const adjacente = selecionados.some(item => item.dia === candidato.dia && Math.abs(item.hora - candidato.hora) <= 1);
        if (!adjacente) selecionados.push(candidato);
        if (selecionados.length === limite) break;
    }

    return selecionados.map(item => ({ ...item, diaLabel: dias[item.dia] }));
}

function subtrairMeses(dataFinal, quantidade) {
    const diaOriginal = dataFinal.getDate();
    const resultado = new Date(dataFinal);
    resultado.setDate(1);
    resultado.setMonth(resultado.getMonth() - quantidade);
    const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
    resultado.setDate(Math.min(diaOriginal, ultimoDia));
    resultado.setHours(0, 0, 0, 0);
    return resultado;
}

function montarMatrizDiaHora(linhas, inicio, fim) {
    const matriz = {};
    linhas.forEach(chamado => {
        const data = tratarFormatoDataExcel(chamado?.['Data de Criação']);
        if (!data || data < inicio || data > fim) return;
        const dia = data.getDay();
        const hora = data.getHours();
        if (!matriz[dia]) matriz[dia] = {};
        matriz[dia][hora] = (matriz[dia][hora] || 0) + 1;
    });
    return matriz;
}

function atualizarJanelasTranquilas(linhas, dataAtual = new Date()) {
    const fim = new Date(dataAtual);
    fim.setHours(23, 59, 59, 999);
    const periodos = [
        { meses: 1, container: 'quietHoursMonth', range: 'quietRangeMonth' },
        { meses: 3, container: 'quietHoursQuarter', range: 'quietRangeQuarter' },
        { meses: 6, container: 'quietHoursSemester', range: 'quietRangeSemester' }
    ];
    const formatarData = data => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(data);

    periodos.forEach(periodo => {
        const inicio = subtrairMeses(fim, periodo.meses);
        const container = document.getElementById(periodo.container);
        const range = document.getElementById(periodo.range);
        if (!container) return;
        if (range) range.textContent = `${formatarData(inicio)}–${formatarData(fim)}`;
        const matriz = montarMatrizDiaHora(linhas, inicio, fim);
        const selecionados = selecionarJanelasTranquilas(matriz, inicio, fim);

        if (!selecionados.length) {
            container.innerHTML = '<span class="quiet-hours-empty">Sem dados suficientes.</span>';
            return;
        }

        container.innerHTML = selecionados.map((item, indice) => `
            <div class="quiet-slot">
                <strong>${indice + 1}. ${item.diaLabel}, ${String(item.hora).padStart(2, '0')}h–${String(item.hora + 1).padStart(2, '0')}h</strong>
                <span>Média de ${item.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} chamado(s)</span>
            </div>
        `).join('');
    });
}

async function carregarDadosAutomatizados() {
    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) {
        uploadStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Carregando dados operacionais em tempo real...`;
    }

    try {
        const response = await fetch('dados.json?t=' + new Date().getTime());
        if (!response.ok) {
            throw new Error("O arquivo de dados integrados ainda não está disponível no servidor.");
        }
        
        const jsonResponse = await response.json();
        
        if (jsonResponse.message && jsonResponse.message.includes("Not Found")) {
            throw new Error("Erro na API do TomTicket: Verifique se o ID ou Token estão corretos.");
        }

        let listaChamados = [];
        if (Array.isArray(jsonResponse)) {
            listaChamados = jsonResponse;
        } else if (jsonResponse.data && Array.isArray(jsonResponse.data)) {
            listaChamados = jsonResponse.data;
        } else if (jsonResponse.chamados && Array.isArray(jsonResponse.chamados)) {
            listaChamados = jsonResponse.chamados;
        } else {
            console.error("Formato inesperado do JSON:", jsonResponse);
            throw new Error("Formato de dados desconhecido. Abra o console do navegador para inspecionar.");
        }

        let usandoCamadaPrivada = false;
        try {
            const chamadosPrivados = window.privateTicketStoreReady ? await window.privateTicketStoreReady : [];
            if (Array.isArray(chamadosPrivados) && chamadosPrivados.length > 0) {
                listaChamados = chamadosPrivados;
                usandoCamadaPrivada = true;
            }
        } catch (privateError) {
            console.warn('Camada privada indisponível; usando somente indicadores sanitizados.', privateError);
        }

        dadosBrutosAPI = listaChamados;

        // Mapeia as colunas exatas da API v2.0 do TomTicket
        dadosPlanilhaGlobal = listaChamados.map(chamado => {
            const nomeCliente = chamado.customer?.name || "Não identificado";
            const emailCliente = chamado.customer?.email || "";
            const organizacaoCliente = chamado.customer?.organization?.name || "Sem organização";
            const statusReaberto = chamado.reopened === true ? "sim" : "Não";

            let termoPrioridade = "Normal";
            if (chamado.priority === 3 || String(chamado.priority).toLowerCase().includes('alta')) termoPrioridade = "Alta";
            if (chamado.priority > 3 || String(chamado.priority).toLowerCase().includes('urgente')) termoPrioridade = "Urgente";

            const slaCumprido = chamado.sla && chamado.sla.deadline && chamado.sla.deadline.accomplished === false ? "não" : "sim";

            let descStatus = "Aberto";
            if (chamado.status && chamado.status.description) {
                descStatus = chamado.status.description;
            } else if (chamado.situation && chamado.situation.description) {
                descStatus = chamado.situation.description;
            }

            if (chamado.end_date && chamado.end_date !== null) {
                descStatus = "Concluído";
            }

            return {
                'Protocolo': chamado.protocol ?? "",
                'Assunto': chamado.subject || "",
                'Status': descStatus,
                'Cliente': nomeCliente,
                'ClienteEmail': emailCliente,
                'Organização': organizacaoCliente,
                'DadosPrivados': usandoCamadaPrivada,
                'Prioridade': termoPrioridade,
                'Data de Criação': chamado.creation_date || "",
                'Data de Finalização': chamado.end_date || "",
                'SLA de Deadline Cumprido': slaCumprido,
                'Reaberto': statusReaberto
            };
        });

        if (dadosPlanilhaGlobal.length > 0) {
        await verificarECadastrarClientesNovos(dadosPlanilhaGlobal.filter(chamado => chamado.DadosPrivados));
            processarIndicadoresEstrategicos();
            await renderizarTabelaUsuarios();
            
            if (uploadStatus) {
                uploadStatus.innerHTML = `<span class="sync-success"><i class="fa-solid fa-circle-check"></i> Base sincronizada com sucesso</span>`;
            }
            const syncRecordCount = document.getElementById('syncRecordCount');
            const syncLastUpdate = document.getElementById('syncLastUpdate');
            if (syncRecordCount) syncRecordCount.textContent = listaChamados.length.toLocaleString('pt-BR');
            if (syncLastUpdate) {
                const dataSincronizacao = jsonResponse.meta?.updated_at ? new Date(jsonResponse.meta.updated_at) : new Date();
                const dataMaisRecente = jsonResponse.meta?.newest_creation_date
                    ? new Date(jsonResponse.meta.newest_creation_date)
                    : listaChamados.reduce((maisRecente, chamado) => {
                        const data = chamado.creation_date ? new Date(chamado.creation_date) : null;
                        return data && !Number.isNaN(data.getTime()) && (!maisRecente || data > maisRecente) ? data : maisRecente;
                    }, null);
                syncLastUpdate.textContent = dataMaisRecente
                    ? `Dados até ${new Intl.DateTimeFormat('pt-BR').format(dataMaisRecente)}`
                    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(dataSincronizacao);
                syncLastUpdate.title = `Coleta executada em ${dataSincronizacao.toLocaleString('pt-BR')}${dataMaisRecente ? `; chamado mais recente em ${dataMaisRecente.toLocaleString('pt-BR')}` : ''}`;
            }
        } else {
            throw new Error("A lista de chamados retornou vazia.");
        }
    } catch (erro) {
        console.error("Erro na leitura automática de dados:", erro);
        if (uploadStatus) {
            uploadStatus.innerHTML = `<span class="sync-error"><i class="fa-solid fa-triangle-exclamation"></i> Erro de sincronização: ${erro.message}</span>`;
        }
    }
}

// ==========================================
// CONTROLE DO MODAL DE INSPEÇÃO DE DADOS DA API
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnInspecionar = document.getElementById('btnInspecionarAPI');
    const modal = document.getElementById('modalInspeção');
    const btnFecharX = document.getElementById('fecharModalInspeção');
    const btnFecharBtn = document.getElementById('btnFecharModalInspeção');
    const btnCopiar = document.getElementById('btnCopiarJSON');
    const codigoBruto = document.getElementById('codigoBrutoJSON');
    let elementoFocoAnterior = null;

    if (btnInspecionar && modal) {
        btnInspecionar.addEventListener('click', () => {
            elementoFocoAnterior = document.activeElement;
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            if (dadosBrutosAPI && dadosBrutosAPI.length > 0) {
                codigoBruto.textContent = JSON.stringify(dadosBrutosAPI.slice(0, 2), null, 2);
            } else {
                codigoBruto.textContent = "Aguardando sincronização: Nenhum dado bruto foi carregado da API do TomTicket no momento.";
            }
            btnFecharX.focus();
        });

        const fecharModal = () => {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            if (elementoFocoAnterior instanceof HTMLElement) elementoFocoAnterior.focus();
        };
        btnFecharX.addEventListener('click', fecharModal);
        btnFecharBtn.addEventListener('click', fecharModal);
        modal.addEventListener('click', event => {
            if (event.target === modal) fecharModal();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.style.display === 'flex') fecharModal();
        });

        btnCopiar.addEventListener('click', () => {
            if (codigoBruto.textContent) {
                navigator.clipboard.writeText(codigoBruto.textContent)
                    .then(() => alert("Estrutura JSON copied com sucesso!"))
                    .catch(err => console.error("Erro ao copiar o JSON:", err));
            }
        });
    }
});

// ==========================================
// 6. ENGENHARIA DOS INDICADORES E MOTOR ANALÍTICO
// ==========================================
function atualizarLeituraExecutiva({ percentualFinalizados, percentualDemandas, percentualReabertos, totalAbertos }) {
    const resolution = document.getElementById('briefResolution');
    const backlog = document.getElementById('briefBacklog');
    const reopen = document.getElementById('briefReopen');

    if (resolution) {
        const estado = percentualFinalizados >= 90 ? 'positive' : percentualFinalizados >= 75 ? 'attention' : 'critical';
        const mensagem = percentualFinalizados >= 90
            ? 'Ritmo de conclusão saudável no período'
            : percentualFinalizados >= 75
                ? 'Conclusão exige acompanhamento próximo'
                : 'Taxa de conclusão abaixo do nível esperado';
        resolution.dataset.state = estado;
        resolution.querySelector('span').textContent = mensagem;
    }

    if (backlog) {
        const estado = percentualDemandas <= 10 ? 'positive' : percentualDemandas <= 25 ? 'attention' : 'critical';
        backlog.dataset.state = estado;
        backlog.querySelector('span').textContent = totalAbertos === 1
            ? '1 chamado permanece em aberto'
            : `${totalAbertos.toLocaleString('pt-BR')} chamados permanecem em aberto`;
    }

    if (reopen) {
        const estado = percentualReabertos <= 5 ? 'positive' : percentualReabertos <= 10 ? 'attention' : 'critical';
        const mensagem = percentualReabertos <= 5
            ? 'Reaberturas dentro de uma faixa controlada'
            : percentualReabertos <= 10
                ? 'Reaberturas merecem atenção preventiva'
                : 'Reaberturas indicam risco de recorrência';
        reopen.dataset.state = estado;
        reopen.querySelector('span').textContent = mensagem;
    }
}

function processarIndicadoresEstrategicos() {
    const uploadStatus = document.getElementById('uploadStatus');
    if (dadosPlanilhaGlobal.length === 0) return;

    try {
        let valInicio = document.getElementById('filtroDataInicio')?.value;
        let valFim = document.getElementById('filtroDataFim')?.value;

        if (!valInicio || !valFim) {
            let datasExistentes = [];
            dadosPlanilhaGlobal.forEach(chamado => {
                let dataOriginalCria = chamado['Data de Criação'];
                let d = tratarFormatoDataExcel(dataOriginalCria);
                if (d) datasExistentes.push(d);
            });

            if (datasExistentes.length > 0) {
                const menorData = new Date(Math.min(...datasExistentes));
                const maiorData = new Date(Math.max(...datasExistentes));

                valInicio = menorData.toISOString().split('T')[0];
                valFim = maiorData.toISOString().split('T')[0];

                const inputInicio = document.getElementById('filtroDataInicio');
                const inputFim = document.getElementById('filtroDataFim');
                if (inputInicio) inputInicio.value = valInicio;
                if (inputFim) inputFim.value = valFim;
            } else {
                valInicio = "2026-01-01";
                valFim = "2026-12-31";
            }
        }

        const filtroInicio = new Date(valInicio + "T00:00:00");
        const filtroFim = new Date(valFim + "T23:59:59");

        const filtroInicioAnt = new Date(filtroInicio);
        filtroInicioAnt.setFullYear(filtroInicioAnt.getFullYear() - 1);
        const filtroFimAnt = new Date(valFim);
        filtroFimAnt.setFullYear(filtroFimAnt.getFullYear() - 1);

        let totalProtocolosPeriodo = 0;
        let totalFinalizados = 0;
        let totalAndamento = 0;
        let totalPausadosOuOutros = 0;
        let totalProtocolosAnoAnterior = 0;
        
        let mesesAgrupadosGeral = {};
        let performanceMensalAgrupada = {};

        let totalFechadosNoFiltro = 0;
        let fechadosNoMesAbertura = 0;
        let fechadosMesDiferente = 0;
        let totalDentroSlaSoma = 0;
        let totalValidosParaSla = 0;

        let totalBacklogAbsoluto = 0; 
        let bkFinalizados = 0;
        let bkAndamento = 0;
        let bkPausados = 0;

        let contSeteDias = 0;
        let contQuinzeDias = 0;
        let contTrintaDias = 0;
        let maxDiasAberto = 0;
        let totalDiasAbertosAcumulados = 0;
        let totalChamadosAbertosCalculados = 0;

        let totalReabertosPeriodo = 0;
        let reabertosPorMesAgrupado = {};
        let chamadosPorClienteAgrupado = {};
        let demandasPorSetor = {};
        let detalhesAging = [];
        let clientesPeriodo = new Set();

        // Variáveis de controle para as novas métricas operacionais
        let somaHorasTrabalho = 0;
        let qtdChamadosFinalizadosComTempo = 0;
        let matrizDiaHora = {}; // Guardará o cruzamento multidimensional de horários

        let bucketsAging = [0, 0, 0, 0, 0];
        const hoje = new Date();
        const cadastroPorChave = new Map();
        listaClientesCache.forEach(item => {
            if (item.email) cadastroPorChave.set(item.email.toLowerCase(), item);
            if (item.nome) cadastroPorChave.set(item.nome.toLocaleLowerCase('pt-BR'), item);
        });

        dadosPlanilhaGlobal.forEach(chamado => {
            if (!chamado || Object.keys(chamado).length === 0) return;

            let dataOriginalCria = chamado['Data de Criação'];
            let dataCriacao = tratarFormatoDataExcel(dataOriginalCria);
            if (!dataCriacao) return;

            const status = String(chamado['Status'] || '').toLowerCase();
            const clienteNome = String(chamado['Cliente'] || 'Desconhecido').trim();
            const clienteEmail = String(chamado['ClienteEmail'] || '').trim().toLowerCase();
            const cadastroSolicitante = cadastroPorChave.get(clienteEmail) || cadastroPorChave.get(clienteNome.toLocaleLowerCase('pt-BR'));
            const setorSolicitante = cadastroSolicitante?.setorAtual || 'Não definido';
            const prioridade = String(chamado['Prioridade'] || '').toLowerCase().trim();
            const slaCumprido = String(chamado['SLA de Deadline Cumprido'] || '').toLowerCase().trim();
            
            const isFinalizado = chamado['Data de Finalização'] !== null && chamado['Data de Finalização'] !== "" || 
                                 status.includes('finalizada') || status.includes('fechado') || status.includes('concluido') || status.includes('encerrado');
            
            const isEmAndamento = !isFinalizado;
            
            const valorReabertoRaw = chamado['Reaberto'];
            const isReaberto = valorReabertoRaw && String(valorReabertoRaw).toLowerCase().trim() === 'sim';

            let dataOriginalFechamento = chamado['Data de Finalização'];
            let dataFinalizacao = tratarFormatoDataExcel(dataOriginalFechamento);

            // Mapeamento multidimensional: Dia da Semana x Hora (Apenas dentro do filtro de data ativo)
            if (dataCriacao >= filtroInicio && dataCriacao <= filtroFim) {
                const diaSemanaIdx = dataCriacao.getDay(); // 0 = Domingo, 1 = Segunda, etc.
                const horaDia = dataCriacao.getHours(); // 0 às 23

                if (!matrizDiaHora[diaSemanaIdx]) matrizDiaHora[diaSemanaIdx] = {};
                if (!matrizDiaHora[diaSemanaIdx][horaDia]) matrizDiaHora[diaSemanaIdx][horaDia] = 0;
                
                matrizDiaHora[diaSemanaIdx][horaDia]++;
            }

            // Cálculo do Tempo de Resolução (MTTR)
            if (isFinalizado && dataFinalizacao) {
                const diffMilissegundos = dataFinalizacao - dataCriacao;
                if (diffMilissegundos >= 0) {
                    const diffHoras = diffMilissegundos / (1000 * 60 * 60);
                    somaHorasTrabalho += diffHoras;
                    qtdChamadosFinalizadosComTempo++;
                }
            }

            if (!isFinalizado && dataCriacao <= filtroFim) {
                totalChamadosAbertosCalculados++;
                const diferencaTempo = Math.max(0, hoje - dataCriacao);
                const idadeDias = Math.floor(diferencaTempo / (1000 * 60 * 60 * 24));
                totalDiasAbertosAcumulados += idadeDias;

                if (idadeDias > maxDiasAberto) {
                    maxDiasAberto = idadeDias;
                }

                if (idadeDias > 7) contSeteDias++;
                if (idadeDias > 15) contQuinzeDias++;
                if (idadeDias > 30) contTrintaDias++;

                if (idadeDias <= 3) bucketsAging[0]++;
                else if (idadeDias <= 7) bucketsAging[1]++;
                else if (idadeDias <= 15) bucketsAging[2]++;
                else if (idadeDias <= 30) bucketsAging[3]++;
                else bucketsAging[4]++;

                detalhesAging.push({
                    protocolo: chamado['Protocolo'],
                    assunto: chamado['Assunto'],
                    solicitante: clienteNome,
                    dias: idadeDias
                });
            }

            if (dataCriacao <= filtroFim) {
                if (!dataFinalizacao || dataFinalizacao >= filtroInicio) {
                    totalBacklogAbsoluto++;
                    if (isFinalizado) bkFinalizados++;
                    else bkAndamento++;
                }
            }

            if (dataCriacao >= filtroInicio && dataCriacao <= filtroFim) {
                totalProtocolosPeriodo++;
                clientesPeriodo.add(clienteNome);
                chamadosPorClienteAgrupado[clienteNome] = (chamadosPorClienteAgrupado[clienteNome] || 0) + 1;
                demandasPorSetor[setorSolicitante] = (demandasPorSetor[setorSolicitante] || 0) + 1;
                const mesAnoLabel = `${String(dataCriacao.getMonth() + 1).padStart(2, '0')}/${dataCriacao.getFullYear()}`;

                if (!mesesAgrupadosGeral[mesAnoLabel]) mesesAgrupadosGeral[mesAnoLabel] = { total: 0, urgente: 0 };
                if (!performanceMensalAgrupada[mesAnoLabel]) {
                    performanceMensalAgrupada[mesAnoLabel] = { criados: 0, fechadosNoMesmoMes: 0, dentroSla: 0, totalValidosSla: 0 };
                }

                mesesAgrupadosGeral[mesAnoLabel].total++;
                if (prioridade.includes('urgente')) mesesAgrupadosGeral[mesAnoLabel].urgente++;
                performanceMensalAgrupada[mesAnoLabel].criados++;

                if (isReaberto) {
                    totalReabertosPeriodo++;
                    if (!reabertosPorMesAgrupado[mesAnoLabel]) reabertosPorMesAgrupado[mesAnoLabel] = 0;
                    reabertosPorMesAgrupado[mesAnoLabel]++;

                }

                if (isFinalizado) {
                    totalFinalizados++;
                    if (dataFinalizacao) {
                        totalFechadosNoFiltro++;
                        if (dataCriacao.getMonth() === dataFinalizacao.getMonth() && dataCriacao.getFullYear() === dataFinalizacao.getFullYear()) {
                            fechadosNoMesAbertura++;
                            performanceMensalAgrupada[mesAnoLabel].fechadosNoMesmoMes++;
                        } else {
                            fechadosMesDiferente++;
                        }
                    }
                } else {
                    totalAndamento++;
                }

                if (slaCumprido === 'sim') {
                    totalDentroSlaSoma++;
                    totalValidosParaSla++;
                    performanceMensalAgrupada[mesAnoLabel].dentroSla++;
                    performanceMensalAgrupada[mesAnoLabel].totalValidosSla++;
                } else if (slaCumprido === 'não' || slaCumprido === 'nao') {
                    totalValidosParaSla++;
                    performanceMensalAgrupada[mesAnoLabel].totalValidosSla++;
                }
            }

            if (dataCriacao >= filtroInicioAnt && dataCriacao <= filtroFimAnt) {
                totalProtocolosAnoAnterior++;
            }
        });

        const labelsOrdenadas = Object.keys(mesesAgrupadosGeral).sort((a, b) => {
            const [mA, aA] = a.split('/').map(Number); const [mB, aB] = b.split('/').map(Number);
            return new Date(aA, mA) - new Date(aB, mB);
        });

        const dataTotalBarras = labelsOrdenadas.map(lbl => mesesAgrupadosGeral[lbl].total);
        const dataUrgenteBarras = labelsOrdenadas.map(lbl => mesesAgrupadosGeral[lbl].urgente || 0);
        inicializarGraficoGeral(labelsOrdenadas, dataTotalBarras, dataUrgenteBarras);

        // Renderiza o novo gráfico multidimensional de ocupação semanal
        inicializarGraficoDiaHora(matrizDiaHora);
        atualizarJanelasTranquilas(dadosPlanilhaGlobal);

        let arrayTaxasResolucao = [];
        let arrayIndicesSla = [];
        let melhorMesNome = "Nenhum";
        let maiorTaxaResolucaoRegistrada = -1;

        labelsOrdenadas.forEach(label => {
            const metrica = performanceMensalAgrupada[label];
            const taxaResolucaoMes = metrica.criados > 0 ? parseFloat(((metrica.fechadosNoMesmoMes / metrica.criados) * 100).toFixed(2)) : 0;
            arrayTaxasResolucao.push(taxaResolucaoMes);

            const indexSlaMes = metrica.totalValidosSla > 0 ? parseFloat(((metrica.dentroSla / metrica.totalValidosSla) * 100).toFixed(2)) : 0;
            arrayIndicesSla.push(indexSlaMes);

            if (taxaResolucaoMes > maiorTaxaResolucaoRegistrada && metrica.criados > 0) {
                maiorTaxaResolucaoRegistrada = taxaResolucaoMes;
                melhorMesNome = `${label} (${taxaResolucaoMes.toFixed(2).replace('.', ',')}%)`;
            }
        });

        const pctDemandasAtuais = totalProtocolosPeriodo > 0 ? ((totalAndamento / totalProtocolosPeriodo) * 100).toFixed(2).replace('.', ',') : '0,00';
        const pctFinalizados = totalProtocolosPeriodo > 0 ? ((totalFinalizados / totalProtocolosPeriodo) * 100).toFixed(2).replace('.', ',') : '0,00';

        // Atualização dos Cards Principais
        const cardT = document.getElementById('kpiTotal'); if (cardT) cardT.textContent = totalProtocolosPeriodo;
        const cardF = document.getElementById('kpiFinalizados'); if (cardF) cardF.textContent = `${pctFinalizados}%`;
        const cardAtuais = document.getElementById('kpiDemandasAtuais'); if (cardAtuais) cardAtuais.textContent = `${pctDemandasAtuais}%`;
        
        // Exibição amigável do Tempo Médio de Trabalho (MTTR)
        const cardTempoMedio = document.getElementById('kpiTempoMedio');
        if (cardTempoMedio) {
            if (qtdChamadosFinalizadosComTempo > 0) {
                const mediaHorasPuras = somaHorasTrabalho / qtdChamadosFinalizadosComTempo;
                if (mediaHorasPuras >= 24) {
                    const dias = (mediaHorasPuras / 24).toFixed(1);
                    cardTempoMedio.textContent = `${dias.replace('.', ',')} dias`;
                } else {
                    cardTempoMedio.textContent = `${mediaHorasPuras.toFixed(1).replace('.', ',')}h`;
                }
            } else {
                cardTempoMedio.textContent = "0,0h";
            }
        }

        const pctReabertosNumero = totalProtocolosPeriodo > 0 ? (totalReabertosPeriodo / totalProtocolosPeriodo) * 100 : 0;
        const pctReabertos = pctReabertosNumero.toFixed(2).replace('.', ',');
        const cardReabertos = document.getElementById('kpiReabertos');
        if (cardReabertos) {
            cardReabertos.textContent = `${pctReabertos}%`;
        }

        const finalizadosContext = document.getElementById('kpiFinalizadosContext');
        const demandasContext = document.getElementById('kpiDemandasContext');
        const reabertosContext = document.getElementById('kpiReabertosContext');
        if (finalizadosContext) finalizadosContext.textContent = `${totalFinalizados.toLocaleString('pt-BR')} chamados concluídos`;
        if (demandasContext) demandasContext.textContent = `${totalAndamento.toLocaleString('pt-BR')} chamados ainda abertos`;
        if (reabertosContext) reabertosContext.textContent = `${totalReabertosPeriodo.toLocaleString('pt-BR')} reincidências no período`;

        atualizarLeituraExecutiva({
            percentualFinalizados: totalProtocolosPeriodo > 0 ? (totalFinalizados / totalProtocolosPeriodo) * 100 : 0,
            percentualDemandas: totalProtocolosPeriodo > 0 ? (totalAndamento / totalProtocolosPeriodo) * 100 : 0,
            percentualReabertos: pctReabertosNumero,
            totalAbertos: totalAndamento
        });

        let labelCrescimento = "0,00%";
        if (totalProtocolosAnoAnterior > 0) {
            let pctCrescimento = ((totalProtocolosPeriodo - totalProtocolosAnoAnterior) / totalProtocolosAnoAnterior) * 100;
            labelCrescimento = pctCrescimento > 0 ? `+${pctCrescimento.toFixed(2).replace('.', ',')}%` : `${pctCrescimento.toFixed(2).replace('.', ',')}%`;
        } else if (totalProtocolosPeriodo > 0) {
            labelCrescimento = "+100,00%";
        }
        
        const crescElement = document.getElementById('kpiCrescimento');
        if (crescElement) {
            crescElement.textContent = labelCrescimento;
            crescElement.style.color = totalProtocolosPeriodo >= totalProtocolosAnoAnterior ? '#10b981' : '#ef4444';
        }

        const perf1 = document.getElementById('perfCard1'); if (perf1) perf1.textContent = `${totalFechadosNoFiltro > 0 ? ((fechadosNoMesAbertura / totalFechadosNoFiltro) * 100).toFixed(2).replace('.', ',') : '0,00'}%`;
        const perf2 = document.getElementById('perfCard2'); if (perf2) perf2.textContent = `${totalValidosParaSla > 0 ? ((totalDentroSlaSoma / totalValidosParaSla) * 100).toFixed(2).replace('.', ',') : '0,00'}%`;
        const perf3 = document.getElementById('perfCard3'); if (perf3) perf3.textContent = `${totalFechadosNoFiltro > 0 ? ((fechadosMesDiferente / totalFechadosNoFiltro) * 100).toFixed(2).replace('.', ',') : '0,00'}%`;
        const perf4 = document.getElementById('perfCard4'); if (perf4) perf4.textContent = melhorMesNome !== "Nenhum" ? melhorMesNome : "Nenhum";

        const totalUrgentesPeriodo = dataUrgenteBarras.reduce((total, valor) => total + valor, 0);
        const supportTotal = document.getElementById('supportTotal'); if (supportTotal) supportTotal.textContent = totalProtocolosPeriodo.toLocaleString('pt-BR');
        const supportUrgent = document.getElementById('supportUrgent'); if (supportUrgent) supportUrgent.textContent = totalUrgentesPeriodo.toLocaleString('pt-BR');
        const supportSla = document.getElementById('supportSla'); if (supportSla) supportSla.textContent = `${totalValidosParaSla > 0 ? ((totalDentroSlaSoma / totalValidosParaSla) * 100).toFixed(2).replace('.', ',') : '0,00'}%`;
        const supportCustomers = document.getElementById('supportCustomers'); if (supportCustomers) supportCustomers.textContent = clientesPeriodo.size.toLocaleString('pt-BR');

        inicializarGraficosPerformance(labelsOrdenadas, arrayTaxasResolucao, arrayIndicesSla);

        const bkTotalPendentesAtuais = totalAndamento;
        const bkPctFechados = totalBacklogAbsoluto > 0 ? ((bkFinalizados / totalBacklogAbsoluto) * 100).toFixed(2).replace('.', ',') : '0,00';
        const bkPctAtuais = totalBacklogAbsoluto > 0 ? ((bkTotalPendentesAtuais / totalBacklogAbsoluto) * 100).toFixed(2).replace('.', ',') : '0,00';

        const bT = document.getElementById('backlogCardTotal'); if (bT) bT.textContent = totalBacklogAbsoluto;
        const bF = document.getElementById('backlogCardFechados'); if (bF) bF.textContent = `${bkFinalizados} (${bkPctFechados}%)`;
        const bAtuais = document.getElementById('backlogCardDemandasAtuais'); if (bAtuais) bAtuais.textContent = `${bkTotalPendentesAtuais} (${bkPctAtuais}%)`;

        let dadosEstoqueInicialLinha = [];
        let dadosFinalizadosNoMesBarras = [];

        labelsOrdenadas.forEach(label => {
            const [mes, ano] = label.split('/').map(Number);
            const primeiroDiaDoMes = new Date(ano, mes - 1, 1, 0, 0, 0);
            const ultimoDiaDoMes = new Date(ano, mes, 0, 23, 59, 59);

            let estoqueInicialContador = 0;
            let finalizadosDentroDoMesContador = 0;

            dadosPlanilhaGlobal.forEach(chamado => {
                if (!chamado || Object.keys(chamado).length === 0) return;
                let dataOriginalCria = chamado['Data de Criação'];
                let dataCria = tratarFormatoDataExcel(dataOriginalCria);
                if (!dataCria) return;

                let dataOriginalFechamento = chamado['Data de Finalização'];
                let dataFechamento = tratarFormatoDataExcel(dataOriginalFechamento);

                const status = String(chamado['Status'] || '').toLowerCase();
                const isFinalizado = chamado['Data de Finalização'] !== null && chamado['Data de Finalização'] !== "" || 
                                     status.includes('finalizada') || status.includes('fechado') || status.includes('concluido') || status.includes('encerrado');

                if (dataCria < primeiroDiaDoMes) {
                    if (!dataFechamento || dataFechamento >= primeiroDiaDoMes) estoqueInicialContador++;
                }
                if (dataCria < primeiroDiaDoMes && isFinalizado && dataFechamento) {
                    if (dataFechamento >= primeiroDiaDoMes && dataFechamento <= ultimoDiaDoMes) finalizadosDentroDoMesContador++;
                }
            });

            dadosEstoqueInicialLinha.push(estoqueInicialContador);
            dadosFinalizadosNoMesBarras.push(finalizadosDentroDoMesContador);
        });

        inicializarGraficosBacklog(labelsOrdenadas, dadosEstoqueInicialLinha, dadosFinalizadosNoMesBarras);

        const elAgingSete = document.getElementById('agingCardSete'); if (elAgingSete) elAgingSete.textContent = contSeteDias;
        const elAgingQuinze = document.getElementById('agingCardQuinze'); if (elAgingQuinze) elAgingQuinze.textContent = contQuinzeDias;
        const elAgingTrinta = document.getElementById('agingCardTrinta'); if (elAgingTrinta) elAgingTrinta.textContent = contTrintaDias;
        const elAgingMaisAntigo = document.getElementById('agingCardMaisAntigo'); if (elAgingMaisAntigo) elAgingMaisAntigo.textContent = `${maxDiasAberto} dias`;
        
        const elAgingMedia = document.getElementById('agingCardMedia');
        if (elAgingMedia) {
            const mediaIdadeFinal = totalChamadosAbertosCalculados > 0 ? (totalDiasAbertosAcumulados / totalChamadosAbertosCalculados).toFixed(1) : "0.0";
            elAgingMedia.textContent = `${mediaIdadeFinal} dias`;
        }

        inicializarGraficoAging(bucketsAging);
        renderizarTabelaAging(detalhesAging);

        const dadosReabertosMes = labelsOrdenadas.map(lbl => reabertosPorMesAgrupado[lbl] || 0);
        inicializarGraficoReabertosMes(labelsOrdenadas, dadosReabertosMes);

        const clientesOrdenadosRanking = Object.keys(chamadosPorClienteAgrupado).sort((a, b) => {
            return chamadosPorClienteAgrupado[b] - chamadosPorClienteAgrupado[a];
        });
        const topClientesLabels = clientesOrdenadosRanking.slice(0, 8);
        const topClientesValores = topClientesLabels.map(cl => chamadosPorClienteAgrupado[cl]);
        
        inicializarGraficoReabertosCliente(topClientesLabels, topClientesValores);

        const setoresOrdenados = Object.keys(demandasPorSetor).sort((a, b) => demandasPorSetor[b] - demandasPorSetor[a]);
        inicializarGraficoDemandasSetor(setoresOrdenados, setoresOrdenados.map(setor => demandasPorSetor[setor]));
        const classificados = listaClientesCache.filter(item => item.setorAtual && item.setorAtual.toLocaleLowerCase('pt-BR') !== 'não definido');
        const setoresDefinidos = new Set(classificados.map(item => item.setorAtual.toLocaleLowerCase('pt-BR')));
        const requesterClassified = document.getElementById('requestersClassified'); if (requesterClassified) requesterClassified.textContent = classificados.length.toLocaleString('pt-BR');
        const requesterUnclassified = document.getElementById('requestersUnclassified'); if (requesterUnclassified) requesterUnclassified.textContent = (listaClientesCache.length - classificados.length).toLocaleString('pt-BR');
        const requesterDepartments = document.getElementById('requestersDepartments'); if (requesterDepartments) requesterDepartments.textContent = setoresDefinidos.size.toLocaleString('pt-BR');

    } catch (erroCritico) {
        console.error("Erro interno detectado no motor analítico:", erroCritico);
        if (uploadStatus) {
            uploadStatus.innerHTML = `<span style="color:#ef4444; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> Diagnóstico: ${erroCritico.message}</span>`;
        }
    }
}

// ==========================================
// 6.1 ATIVAÇÃO DOS FILTROS DE DATA COM SUPORTE A DIGITAÇÃO NUMÉRICA DIRETA (31072026)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const inputInicio = document.getElementById('filtroDataInicio');
    const inputFim = document.getElementById('filtroDataFim');

    const configurarCampoDataLivre = (input) => {
        if (!input) return;

        input.addEventListener('focus', () => {
            let valorAtual = input.value; 
            input.type = 'text';
            input.placeholder = 'DDMMAAAA';
            
            if (valorAtual && valorAtual.includes('-')) {
                const partes = valorAtual.split('-');
                if (partes.length === 3) {
                    input.value = `${partes[2]}/${partes[1]}/${partes[0]}`;
                }
            }
        });

        input.addEventListener('blur', () => {
            let valorDigitado = input.value.trim();
            let apenasNumeros = valorDigitado.replace(/\D/g, '');

            if (apenasNumeros.length === 8) {
                const dia = apenasNumeros.substring(0, 2);
                const mes = apenasNumeros.substring(2, 4);
                const ano = apenasNumeros.substring(4, 8);
                input.value = `${ano}-${mes}-${dia}`;
            } 
            else if (valorDigitado.includes('/')) {
                const partes = valorDigitado.split('/');
                if (partes.length === 3) {
                    const dia = partes[0].padStart(2, '0');
                    const mes = partes[1].padStart(2, '0');
                    const ano = partes[2];
                    input.value = `${ano}-${mes}-${dia}`;
                }
            }
            
            input.type = 'date';

            if (typeof dadosPlanilhaGlobal !== 'undefined' && dadosPlanilhaGlobal.length > 0) {
                processarIndicadoresEstrategicos();
            }
        });

        input.addEventListener('change', () => {
            if (input.type === 'date' && typeof dadosPlanilhaGlobal !== 'undefined' && dadosPlanilhaGlobal.length > 0) {
                processarIndicadoresEstrategicos();
            }
        });
    };

    configurarCampoDataLivre(inputInicio);
    configurarCampoDataLivre(inputFim);
});

// ==========================================
// 7. GESTÃO ORG. DE CLIENTES E HISTÓRICO
// ==========================================
let listaClientesCache = [];

function escaparHTML(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function obterClientStore() {
    if (!window.clientStoreReady) throw new Error('Camada de persistência de clientes indisponível.');
    return window.clientStoreReady;
}

async function verificarECadastrarClientesNovos(linhasPlanilha) {
    try {
        const porChave = new Map();
        linhasPlanilha.forEach(chamado => {
            const nome = String(chamado?.Cliente || '').trim();
            const email = String(chamado?.ClienteEmail || '').trim().toLowerCase();
            if (!nome || nome === 'Não identificado') return;
            const chave = email || nome.toLocaleLowerCase('pt-BR');
            porChave.set(chave, { nome, email, organizacao: String(chamado?.['Organização'] || 'Sem organização') });
        });
        const store = await obterClientStore();
        listaClientesCache = await store.seedRequesters([...porChave.values()]);
    } catch (erroCadastro) {
        console.error('Falha segura ao verificar novos solicitantes:', erroCadastro);
    }
}

async function renderizarTabelaUsuarios() {
    const corpoTabela = document.getElementById('tabelaUsuariosCorpo');
    if (!corpoTabela) return;

    try {
        const store = await obterClientStore();
        listaClientesCache = await store.list();
    } catch (error) {
        console.error('Falha ao carregar solicitantes:', error);
        corpoTabela.innerHTML = '<tr><td colspan="4" class="table-empty-state">Não foi possível carregar a base de solicitantes.</td></tr>';
        return;
    }

    const clientTableCount = document.getElementById('clientTableCount');
    if (clientTableCount) clientTableCount.textContent = `${listaClientesCache.length.toLocaleString('pt-BR')} registros`;

    if (listaClientesCache.length === 0) {
        corpoTabela.innerHTML = '<tr><td colspan="4" class="table-empty-state">Nenhum solicitante cadastrado.</td></tr>';
        return;
    }

    let htmlHTML = "";
    listaClientesCache.forEach((cliente, index) => {
        htmlHTML += `
            <tr>
                <td class="client-name"><div class="access-user-cell"><strong>${escaparHTML(cliente.nome)}</strong><small>${escaparHTML(cliente.email || cliente.organizacao)}</small></div></td>
                <td><span class="table-badge">${escaparHTML(cliente.setorAtual)}</span></td>
                <td><span class="table-badge table-badge-muted">${escaparHTML(cliente.unidade)}</span></td>
                <td class="table-actions">
                    <button onclick="carregarClienteParaEdicao(${index})" class="table-edit-btn"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                </td>
            </tr>
        `;
    });
    corpoTabela.innerHTML = htmlHTML;
}

window.carregarClienteParaEdicao = function(index) {
    const cliente = listaClientesCache[index];

    if (!cliente) return;

    document.getElementById('editUserIndex').value = index;
    document.getElementById('editUserNome').value = cliente.nome;
    document.getElementById('editUserSetor').value = cliente.setorAtual.toLowerCase() === "não definido" ? "" : cliente.setorAtual;
    document.getElementById('editUserUnidade').value = cliente.unidade.toLowerCase() === "não definido" ? "" : cliente.unidade;
    
    const hoje = new Date();
    document.getElementById('editUserDataMudanca').value = hoje.toISOString().split('T')[0];

    exibirHistoricoLogs(cliente.historicoSetores);
}

function exibirHistoricoLogs(historico) {
    const containerHistorico = document.getElementById('listaHistoricoSetores');
    if (!containerHistorico) return;

    let htmlHTML = "";
    [...(historico || [])].map((item, grupoIndex) => ({ item, grupoIndex })).reverse().forEach(({ item, grupoIndex }) => {
        const logs = Array.isArray(item.logs) ? item.logs : [];
        htmlHTML += `<li class="history-group"><strong>${escaparHTML(item.data)}:</strong><ul>`;
        logs.forEach((log, logIndex) => {
            htmlHTML += `
                <li class="history-entry">
                    <span>${escaparHTML(log)}</span>
                    <button type="button" class="history-delete-btn" onclick="excluirHistoricoSolicitante(${grupoIndex}, ${logIndex})" title="Excluir esta alteração" aria-label="Excluir alteração do histórico">
                        <i class="fa-solid fa-trash-can"></i> Excluir
                    </button>
                </li>`;
        });
        htmlHTML += '</ul></li>';
    });
    containerHistorico.innerHTML = htmlHTML || '<li class="history-empty">Nenhuma alteração registrada.</li>';
}

window.excluirHistoricoSolicitante = async function(grupoIndex, logIndex) {
    if (window.dashboardAuthorization?.role !== 'admin') {
        alert('Somente administradores podem excluir registros do histórico.');
        return;
    }

    const requesterIndex = Number(document.getElementById('editUserIndex')?.value);
    const cliente = listaClientesCache[requesterIndex];
    const grupo = cliente?.historicoSetores?.[grupoIndex];
    const log = grupo?.logs?.[logIndex];
    if (!cliente || !grupo || typeof log !== 'string') {
        alert('Este registro não está mais disponível. Selecione novamente o solicitante.');
        return;
    }

    const confirmado = confirm(`Excluir permanentemente esta alteração do histórico?\n\n${grupo.data}: ${log}\n\nO setor e a unidade atuais não serão modificados.`);
    if (!confirmado) return;

    const historicoAtualizado = cliente.historicoSetores.map(item => ({
        ...item,
        logs: [...(item.logs || [])]
    }));
    historicoAtualizado[grupoIndex].logs.splice(logIndex, 1);
    if (historicoAtualizado[grupoIndex].logs.length === 0) historicoAtualizado.splice(grupoIndex, 1);

    try {
        const store = await obterClientStore();
        const clienteAtualizado = await store.update({ ...cliente, historicoSetores: historicoAtualizado });
        listaClientesCache[requesterIndex] = clienteAtualizado;
        exibirHistoricoLogs(clienteAtualizado.historicoSetores);
        alert('Registro removido do histórico.');
    } catch (error) {
        console.error('Falha ao excluir registro do histórico:', error);
        alert('Não foi possível excluir o registro. Verifique sua conexão e tente novamente.');
    }
};

const formEditar = document.getElementById('formEditarUsuario');
if (formEditar) {
    formEditar.addEventListener('submit', async function(e) {
        e.preventDefault();

        const index = document.getElementById('editUserIndex').value;
        if (index === "") {
            alert("Selecione um solicitante na tabela antes de salvar!");
            return;
        }

        let cliente = listaClientesCache[Number(index)];
        if (!cliente) {
            alert('O solicitante selecionado não está mais disponível.');
            return;
        }

        const novoSetor = document.getElementById('editUserSetor').value.trim() || "Não Definido";
        const novaUnidade = document.getElementById('editUserUnidade').value.trim() || "Não Definido";
        
        const inputData = document.getElementById('editUserDataMudanca').value;
        let dataEfetivaFormatada = obterDataFormatadaHoje().split(' ')[0];
        if (inputData) {
            const [ano, mes, dia] = inputData.split('-');
            dataEfetivaFormatada = `${dia}/${mes}/${ano}`;
        }

        let logsDoLancamento = [];

        if (cliente.setorAtual.toLowerCase() !== novoSetor.toLowerCase()) {
            logsDoLancamento.push(`Setor: Mudou de [${cliente.setorAtual}] para [${novoSetor}]`);
            cliente.setorAtual = novoSetor;
        }

        if (cliente.unidade.toLowerCase() !== novaUnidade.toLowerCase()) {
            logsDoLancamento.push(`Localidade: Movido de [${cliente.unidade}] para [${novaUnidade}]`);
            cliente.unidade = novaUnidade;
        }

        if (logsDoLancamento.length > 0) {
            let registroDataExistente = cliente.historicoSetores.find(h => h.data.split(' ')[0] === dataEfetivaFormatada.split(' ')[0]);
            
            if (registroDataExistente) {
                registroDataExistente.logs.push(...logsDoLancamento);
            } else {
                cliente.historicoSetores.push({
                    data: dataEfetivaFormatada,
                    logs: logsDoLancamento
                });
            }

            cliente.historicoSetores.sort((a, b) => {
                const [diaA, mesA, anoA] = a.data.split(' ')[0].split('/').map(Number);
                const [diaB, mesB, anoB] = b.data.split(' ')[0].split('/').map(Number);
                return new Date(anoA, mesA - 1, diaA) - new Date(anoB, mesB - 1, diaB);
            });

            try {
                const store = await obterClientStore();
                const clienteAtualizado = await store.update(cliente);
                listaClientesCache[Number(index)] = clienteAtualizado;
                alert("Setor do solicitante atualizado e gravado na linha do tempo histórica!");
            } catch (error) {
                console.error('Falha ao salvar vínculo organizacional:', error);
                alert('Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.');
                return;
            }
        } else {
            alert("Nenhuma alteração detectada nos campos de Setor ou Unidade.");
        }

        document.getElementById('formEditarUsuario').reset();
        document.getElementById('editUserIndex').value = "";
        document.getElementById('listaHistoricoSetores').innerHTML = `<li style="color:#94a3b8; list-style:none;">Selecione um cliente para auditar o histórico.</li>`;
        
        await renderizarTabelaUsuarios();
        processarIndicadoresEstrategicos();
    });
}

function obterDataFormatadaHoje() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
