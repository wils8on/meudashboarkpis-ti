// ==========================================
// 1. GUARDA DE SEGURANÇA, LOGOUT & TEMA
// ==========================================
if (localStorage.getItem('logado') !== 'true') {
    window.location.href = 'index.html';
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', function() {
        localStorage.removeItem('logado');
        window.location.href = 'index.html';
    });
}

// Inicialização e gerenciamento do Tema (Claro/Escuro)
document.addEventListener('DOMContentLoaded', () => {
    const temaSalvo = localStorage.getItem('dashboard-theme') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);
});

// Função global para alternar o tema
window.alternarModoTema = function() {
    const temaAtual = document.documentElement.getAttribute('data-theme');
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', novoTema);
    localStorage.setItem('dashboard-theme', novoTema);
    
    // Força o reprocessamento para redesenhar os eixos dos gráficos em tempo real
    if (dadosPlanilhaGlobal.length > 0) {
        processarIndicadoresEstrategicos();
    }
};

function obterCorTextoPorTema() {
    const temaAtivo = document.documentElement.getAttribute('data-theme');
    return temaAtivo === 'dark' ? '#cbd5e1' : '#475569';
}

// ==========================================
// 2. SISTEMA DE NAVEGAÇÃO (MENU LATERAL)
// ==========================================
const menuItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.tab-content');

menuItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetSectionId = this.getAttribute('data-target');
        const targetTarget = document.getElementById(targetSectionId);
        
        if (targetTarget) {
            menuItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            tabs.forEach(tab => tab.classList.remove('active'));
            targetTarget.classList.add('active');
            
            if (targetSectionId === 'aba-usuarios') {
                renderizarTabelaUsuarios();
            }
        }
    });
});

// ==========================================
// 3. MEMÓRIA GLOBAL E INSTÂNCIAS DOS GRÁFICOS
// ==========================================
let dadosPlanilhaGlobal = [];
let chartGeralReal = null;
let chartLinhaResolucao = null;
let chartSlaMensal = null;
let chartBacklogEvolucao = null;
let chartBacklogDistribuicao = null;
let chartAging = null; // Memória do novo gráfico de Aging

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

// NOVO GRÁFICO: DISTRIBUIÇÃO DE AGING POR FAIXA
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
                backgroundColor: '#7dd3fc', // Azul piscina suave como no print de referência
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

// Inicialização de Filtros Padrão
document.addEventListener('DOMContentLoaded', () => {
    const fInicio = document.getElementById('filtroDataInicio');
    const fFim = document.getElementById('filtroDataFim');
    
    if (fInicio && fFim) {
        fInicio.value = "2023-01-01";
        fFim.value = "2026-12-31";
        
        fInicio.addEventListener('change', processarIndicadoresEstrategicos);
        fFim.addEventListener('change', processarIndicadoresEstrategicos);
    }
    inicializarGraficoGeral();
    renderizarTabelaUsuarios();
});

// ==========================================
// 4. LEITURA DO EXCEL (SHEETJS)
// ==========================================
const excelInput = document.getElementById('excelFile');
if (excelInput) {
    excelInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const uploadStatus = document.getElementById('uploadStatus');
        if (uploadStatus) uploadStatus.textContent = `Processando chamados: ${file.name}...`;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                const linhasBrutas = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                dadosPlanilhaGlobal = linhasBrutas.filter(chamado => {
                    if (!chamado) return false;
                    const conteudoLinha = Object.values(chamado).join('').trim();
                    return conteudoLinha.length > 0;
                });

                if (dadosPlanilhaGlobal.length > 0) {
                    verificarECadastrarClientesNovos(dadosPlanilhaGlobal);
                    processarIndicadoresEstrategicos();
                    renderizarTabelaUsuarios(); 
                } else {
                    if (uploadStatus) uploadStatus.textContent = "Nenhum dado legível encontrado na planilha.";
                }
            } catch (err) {
                console.error("Erro crítico na leitura estrutural do Excel:", err);
                if (uploadStatus) uploadStatus.innerHTML = `<span style="color:#ef4444;">Erro na leitura: ${err.message}</span>`;
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function tratarFormatoDataExcel(dataInput) {
    if (!dataInput) return null;
    if (dataInput instanceof Date && !isNaN(dataInput.getTime())) return dataInput;
    
    if (typeof dataInput === 'number' || !isNaN(Number(dataInput))) {
        const numeroSerial = Number(dataInput);
        return new Date((numeroSerial - 25569) * 86400 * 1000);
    }
    
    const dataStr = String(dataInput).trim();
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
// 5. ENGENHARIA DOS INDICADORES E PERFORMANCE
// ==========================================
function processarIndicadoresEstrategicos() {
    const uploadStatus = document.getElementById('uploadStatus');
    if (dadosPlanilhaGlobal.length === 0) return;

    try {
        const valInicio = document.getElementById('filtroDataInicio')?.value;
        const valFim = document.getElementById('filtroDataFim')?.value;
        if (!valInicio || !valFim) return;

        const filtroInicio = new Date(valInicio + "T00:00:00");
        const filtroFim = new Date(valFim + "T23:59:59");

        const filtroInicioAnt = new Date(filtroInicio);
        filtroInicioAnt.setFullYear(filtroInicioAnt.getFullYear() - 1);
        const filtroFimAnt = new Date(filtroFim);
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

        // Variaveis de monitoramento do Aging (Chamados Ativos/Abertos)
        let contSeteDias = 0;
        let contQuinzeDias = 0;
        let contTrintaDias = 0;
        let maxDiasAberto = 0;
        let totalDiasAbertosAcumulados = 0;
        let totalChamadosAbertosCalculados = 0;

        // Buckets para o grafico de barras de Aging (0-3, 4-7, 8-15, 16-30, +30)
        let bucketsAging = [0, 0, 0, 0, 0];
        const hoje = new Date();

        dadosPlanilhaGlobal.forEach(chamado => {
            if (!chamado || Object.keys(chamado).length === 0) return;

            let dataOriginalCria = chamado['Data de Criação'] || chamado['Data_de_Criação'] || chamado['Abertura'];
            let dataCriacao = tratarFormatoDataExcel(dataOriginalCria);
            if (!dataCriacao) return;

            const status = String(chamado['Status'] || chamado['Última Situação'] || chamado['Situação'] || '').toLowerCase();
            const prioridade = String(chamado['Prioridade'] || '').toLowerCase().trim();
            const slaCumprido = String(chamado['SLA de Deadline Cumprido'] || chamado['SLA_de_Deadline_Cumprido'] || chamado['SLA'] || '').toLowerCase().trim();
            const isFinalizado = status.includes('finalizada') || status.includes('fechado') || status.includes('concluido');
            const isEmAndamento = status.includes('andamento') || status.includes('atendimento') || status.includes('aberto') || status.includes('vinculado');

            let dataOriginalFechamento = chamado['Data de Finalização'] || chamado['Data_de_Finalização'] || chamado['Encerramento'];
            let dataFinalizacao = tratarFormatoDataExcel(dataOriginalFechamento);

            // PROCESSAMENTO DE AGING (Apenas para chamados ativos/em aberto)
            if (!isFinalizado && dataCriacao <= filtroFim) {
                totalChamadosAbertosCalculados++;
                
                // Calcula a idade do chamado em dias corridos
                const diferencaTempo = Math.max(0, hoje - dataCriacao);
                const idadeDias = Math.floor(diferencaTempo / (1000 * 60 * 60 * 24));
                
                totalDiasAbertosAcumulados += idadeDias;

                if (idadeDias > maxDiasAberto) {
                    maxDiasAberto = idadeDias;
                }

                // Incrementa os contadores dos Cards de Envelhecimento
                if (idadeDias > 7) contSeteDias++;
                if (idadeDias > 15) contQuinzeDias++;
                if (idadeDias > 30) contTrintaDias++;

                // Enquadra o chamado no respectivo bucket do grafico
                if (idadeDias <= 3) bucketsAging[0]++;
                else if (idadeDias <= 7) bucketsAging[1]++;
                else if (idadeDias <= 15) bucketsAging[2]++;
                else if (idadeDias <= 30) bucketsAging[3]++;
                else bucketsAging[4]++;
            }

            if (dataCriacao <= filtroFim) {
                if (!dataFinalizacao || dataFinalizacao >= filtroInicio) {
                    totalBacklogAbsoluto++;
                    if (isFinalizado) bkFinalizados++;
                    else if (isEmAndamento) bkAndamento++;
                    else bkPausados++;
                }
            }

            if (dataCriacao >= filtroInicio && dataCriacao <= filtroFim) {
                totalProtocolosPeriodo++;
                const mesAnoLabel = `${String(dataCriacao.getMonth() + 1).padStart(2, '0')}/${dataCriacao.getFullYear()}`;

                if (!mesesAgrupadosGeral[mesAnoLabel]) mesesAgrupadosGeral[mesAnoLabel] = { total: 0, urgente: 0 };
                if (!performanceMensalAgrupada[mesAnoLabel]) {
                    performanceMensalAgrupada[mesAnoLabel] = { criados: 0, fechadosNoMesmoMes: 0, dentroSla: 0, totalValidosSla: 0 };
                }

                mesesAgrupadosGeral[mesAnoLabel].total++;
                
                if (prioridade.includes('urgente')) {
                    mesesAgrupadosGeral[mesAnoLabel].urgente++;
                }
                
                performanceMensalAgrupada[mesAnoLabel].criados++;

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
                } else if (isEmAndamento) {
                    totalAndamento++;
                } else {
                    totalPausadosOuOutros++;
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
        const dataUrgenteBarras = labelsOrdenadas.map(lbl => mesesAgrupadosGeral[lbl].urgente);
        inicializarGraficoGeral(labelsOrdenadas, dataTotalBarras, dataUrgenteBarras);

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

        const totalAtuaisNoPeriodo = totalAndamento + totalPausadosOuOutros;
        const pctDemandasAtuais = totalProtocolosPeriodo > 0 ? ((totalAtuaisNoPeriodo / totalProtocolosPeriodo) * 100).toFixed(2).replace('.', ',') : '0,00';
        const pctFinalizados = totalProtocolosPeriodo > 0 ? ((totalFinalizados / totalProtocolosPeriodo) * 100).toFixed(2).replace('.', ',') : '0,00';

        const cardT = document.getElementById('kpiTotal'); if (cardT) cardT.textContent = totalProtocolosPeriodo;
        const cardF = document.getElementById('kpiFinalizados'); if (cardF) cardF.textContent = `${pctFinalizados}%`;
        const cardAtuais = document.getElementById('kpiDemandasAtuais'); if (cardAtuais) cardAtuais.textContent = `${pctDemandasAtuais}%`;

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
        const perf4 = document.getElementById('perfCard4'); if (perf4) perf4.textContent = melhorMesNome;

        inicializarGraficosPerformance(labelsOrdenadas, arrayTaxasResolucao, arrayIndicesSla);

        const bkTotalPendentesAtuais = bkAndamento + bkPausados;
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
                let dataOriginalCria = chamado['Data de Criação'] || chamado['Data_de_Criação'] || chamado['Abertura'];
                let dataCria = tratarFormatoDataExcel(dataOriginalCria);
                if (!dataCria) return;

                let dataOriginalFechamento = chamado['Data de Finalização'] || chamado['Data_de_Finalização'] || chamado['Encerramento'];
                let dataFechamento = tratarFormatoDataExcel(dataOriginalFechamento);

                const status = String(chamado['Status'] || chamado['Última Situação'] || chamado['Situação'] || '').toLowerCase();
                const isFinalizado = status.includes('finalizada') || status.includes('fechado') || status.includes('concluido');

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

        // ATUALIZAÇÃO DOS CARDS E GRÁFICO DO AGING NO DOM
        const elAgingSete = document.getElementById('agingCardSete'); if (elAgingSete) elAgingSete.textContent = contSeteDias;
        const elAgingQuinze = document.getElementById('agingCardQuinze'); if (elAgingQuinze) elAgingQuinze.textContent = contQuinzeDias;
        const elAgingTrinta = document.getElementById('agingCardTrinta'); if (elAgingTrinta) elAgingTrinta.textContent = contTrintaDias;
        const elAgingMaisAntigo = document.getElementById('agingCardMaisAntigo'); if (elAgingMaisAntigo) elAgingMaisAntigo.textContent = `${maxDiasAberto} dias`;
        
        const elAgingMedia = document.getElementById('agingCardMedia');
        if (elAgingMedia) {
            const mediaIdadeFinal = totalChamadosAbertosCalculados > 0 ? (totalDiasAbertosAcumulados / totalChamadosAbertosCalculados).toFixed(1) : "0.0";
            elAgingMedia.textContent = `${mediaIdadeFinal} dias`;
        }

        // Renderiza o gráfico de barras de Aging
        inicializarGraficoAging(bucketsAging);
        
        if (uploadStatus) {
            uploadStatus.innerHTML = `<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Base conectada com sucesso!</span>`;
        }

    } catch (erroCrítico) {
        console.error("Erro interno detectado no motor analítico:", erroCrítico);
        if (uploadStatus) {
            uploadStatus.innerHTML = `<span style="color:#ef4444; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> Diagnóstico: ${erroCrítico.message}</span>`;
        }
    }
}

// ==========================================
// 6. ENGENHARIA DE GESTÃO DE USUÁRIOS/CLIENTES (HISTÓRICO MANUAL)
// ==========================================
function verificarECadastrarClientesNovos(linhasPlanilha) {
    try {
        let listaClientesSalva = JSON.parse(localStorage.getItem('cadastroClientesDB')) || [];
        let houveMudanca = false;

        linhasPlanilha.forEach(chamado => {
            if (!chamado) return;
            const nomeCliente = String(chamado['Cliente'] || '').trim();
            if (!nomeCliente || nomeCliente === "") return;

            const existe = listaClientesSalva.some(c => c.nome.toLowerCase() === nomeCliente.toLowerCase());
            if (!existe) {
                listaClientesSalva.push({
                    nome: nomeCliente,
                    setorAtual: "Não Definido",
                    unidade: "Não Definido",
                    historicoSetores: [
                        { data: obterDataFormatadaHoje(), logs: ["Cadastrado via importação de arquivo"] }
                    ]
                });
                houveMudanca = true;
            }
        });

        if (houveMudanca) {
            localStorage.setItem('cadastroClientesDB', JSON.stringify(listaClientesSalva));
        }
    } catch (erroCadastro) {
        console.error("Falha segura ao verificar novos clientes:", erroCadastro);
    }
}

function renderizarTabelaUsuarios() {
    const corpoTabela = document.getElementById('tabelaUsuariosCorpo');
    if (!corpoTabela) return;

    const listaClientes = JSON.parse(localStorage.getItem('cadastroClientesDB')) || [];

    if (listaClientes.length === 0) {
        corpoTabela.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum cliente carregado. Suba uma planilha na aba Visão Geral para popular a base.</td></tr>`;
        return;
    }

    let htmlHTML = "";
    listaClientes.forEach((cliente, index) => {
        htmlHTML += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px 16px; font-weight:600;">${cliente.nome}</td>
                <td style="padding: 12px 16px;"><span style="background: var(--bg-table-hdr); padding:4px 8px; border-radius:4px; font-size:12px;">${cliente.setorAtual}</span></td>
                <td style="padding: 12px 16px;"><span style="background: var(--bg-main); padding:4px 8px; border-radius:4px; font-size:12px; font-weight:500;">${cliente.unidade}</span></td>
                <td style="padding: 12px 16px; text-align: center;">
                    <button onclick="carregarClienteParaEdicao(${index})" style="padding: 6px 12px; background:#3b82f6; color:white; border:none; border-radius:4px; font-weight:600; cursor:pointer; font-size:12px;"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                </td>
            </tr>
        `;
    });
    corpoTabela.innerHTML = htmlHTML;
}

window.carregarClienteParaEdicao = function(index) {
    const listaClientes = JSON.parse(localStorage.getItem('cadastroClientesDB')) || [];
    const cliente = listaClientes[index];

    if (!cliente) return;

    document.getElementById('editUserIndex').value = index;
    document.getElementById('editUserNome').value = cliente.nome;
    document.getElementById('editUserSetor').value = cliente.setorAtual === "Não Definido" ? "" : cliente.setorAtual;
    document.getElementById('editUserUnidade').value = cliente.unidade === "Não Definido" ? "" : cliente.unidade;
    
    const hoje = new Date();
    document.getElementById('editUserDataMudanca').value = hoje.toISOString().split('T')[0];

    exibirHistoricoLogs(cliente.historicoSetores);
}

function exibirHistoricoLogs(historico) {
    const containerHistorico = document.getElementById('listaHistoricoSetores');
    if (!containerHistorico) return;

    let htmlHTML = "";
    [...historico].reverse().forEach(item => {
        const logsUnificados = item.logs.join(" | ");
        htmlHTML += `<li style="margin-bottom:6px;"><strong>${item.data}:</strong> ${logsUnificados}</li>`;
    });
    containerHistorico.innerHTML = htmlHTML;
}

const formEditar = document.getElementById('formEditarUsuario');
if (formEditar) {
    formEditar.addEventListener('submit', function(e) {
        e.preventDefault();

        const index = document.getElementById('editUserIndex').value;
        if (index === "") {
            alert("Selecione um cliente na tabela antes de salvar!");
            return;
        }

        let listaClientes = JSON.parse(localStorage.getItem('cadastroClientesDB')) || [];
        let cliente = listaClientes[index];

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

            listaClientes[index] = cliente;
            localStorage.setItem('cadastroClientesDB', JSON.stringify(listaClientes));
            alert("Vínculo organizacional updated e gravado na linha do tempo histórica!");
        } else {
            alert("Nenhuma alteração detectada nos campos de Setor ou Unidade.");
        }

        document.getElementById('formEditarUsuario').reset();
        document.getElementById('editUserIndex').value = "";
        document.getElementById('listaHistoricoSetores').innerHTML = `<li style="color:#94a3b8; list-style:none;">Selecione um cliente para auditar o histórico.</li>`;
        
        renderizarTabelaUsuarios();
    });
}

function obterDataFormatadaHoje() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}