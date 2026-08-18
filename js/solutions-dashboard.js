const expectedHeaders = {
    nome: 'Nome da Solução Criada', motivo: 'Motivo pelo qual houve necessidade dessa solução', objetivo: 'Qual o objetivo dessa solução?',
    setor: 'Setor para qual a solução foi criada', responsavelNome: 'Nome', responsavelId: 'Usuário responsável pelo desenvolvimento da solução',
    tipo: 'Tipo da Solução', status: 'Status da Solução', data: 'Data', querySql: 'Query SQL Desenvolvida:', numeroComunicado: 'Número do Comunicado:'
};
const labels = { nome: 'Nome', motivo: 'Motivo', objetivo: 'Objetivo', setor: 'Setor', responsavelNome: 'Responsável', responsavelId: 'ID do responsável', tipo: 'Tipo', status: 'Status', data: 'Data', querySql: 'Query SQL', numeroComunicado: 'Comunicado', registro: 'Registro' };
let solutions = [];
let filteredSolutions = [];
let typeChart = null;
let sectorChart = null;

const clean = value => String(value ?? '').trim();
const escapeHtml = value => clean(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const normalizeText = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function hashKey(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function excelDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX?.SSF) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const text = clean(value);
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

async function parseWorkbook(file) {
    if (!window.XLSX) throw new Error('O leitor de Excel ainda não foi carregado. Atualize a página e tente novamente.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const headerIndex = matrix.findIndex(row => row.some(cell => clean(cell) === expectedHeaders.nome));
    if (headerIndex < 0) throw new Error('Cabeçalho "Nome da Solução Criada" não encontrado no arquivo.');
    const header = matrix[headerIndex].map(clean);
    const indexes = Object.fromEntries(Object.entries(expectedHeaders).map(([field, title]) => [field, header.indexOf(title)]));
    const missing = Object.entries(indexes).filter(([, index]) => index < 0).map(([field]) => expectedHeaders[field]);
    if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
    const records = [];
    for (const row of matrix.slice(headerIndex + 1)) {
        if (!clean(row[indexes.nome])) continue;
        const record = Object.fromEntries(Object.entries(indexes).map(([field, index]) => [field, field === 'data' ? excelDate(row[index]) : clean(row[index])]));
        const sourceKey = [record.nome, record.responsavelId, record.tipo, record.data].map(normalizeText).join('|');
        record.sourceKey = sourceKey;
        record.id = await hashKey(sourceKey);
        records.push(record);
    }
    const ids = new Set(records.map(item => item.id));
    if (ids.size !== records.length) throw new Error('O arquivo contém registros com a mesma chave operacional. Revise nome, responsável, tipo e data.');
    return { records, metadata: { fileName: file.name, importedAt: new Date().toISOString() } };
}

async function store() {
    if (!window.solutionsStoreReady) throw new Error('Camada de soluções indisponível.');
    return window.solutionsStoreReady;
}

function formatDate(value) {
    if (!value) return 'Sem data';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
}

function countBy(field, records = solutions) {
    return records.reduce((acc, item) => { const key = item[field] || 'Não informado'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
}

function fillSelect(id, values) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Todos</option>' + [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    select.value = current;
}

function renderKpis() {
    const finished = solutions.filter(item => normalizeText(item.status) === 'finalizado').length;
    const development = solutions.filter(item => normalizeText(item.status).includes('desenvolvimento')).length;
    const values = {
        solutionTotal: solutions.length,
        solutionFinished: finished,
        solutionDevelopment: development,
        solutionCompletion: solutions.length ? `${Math.round((finished / solutions.length) * 100)}%` : '0%',
        solutionSectors: new Set(solutions.map(item => item.setor).filter(Boolean)).size,
        solutionWithSql: solutions.filter(item => item.querySql).length,
    };
    Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = Number.isInteger(value) ? value.toLocaleString('pt-BR') : value; });
}

function renderCharts() {
    if (!window.Chart) return;
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false }, legend: { position: 'bottom' } } };
    const types = Object.entries(countBy('tipo')).sort((a, b) => b[1] - a[1]);
    const sectors = Object.entries(countBy('setor')).sort((a, b) => b[1] - a[1]);
    if (typeChart) typeChart.destroy();
    if (sectorChart) sectorChart.destroy();
    const typeCanvas = document.getElementById('solutionsTypeChart');
    const sectorCanvas = document.getElementById('solutionsSectorChart');
    if (typeCanvas) typeChart = new Chart(typeCanvas, { type: 'doughnut', data: { labels: types.map(item => item[0]), datasets: [{ data: types.map(item => item[1]), backgroundColor: ['#8b5cf6','#34d399','#60a5fa','#fbbf24','#f472b6','#fb7185','#22d3ee','#a78bfa'] }] }, options: chartOptions });
    if (sectorCanvas) sectorChart = new Chart(sectorCanvas, { type: 'bar', data: { labels: sectors.map(item => item[0]), datasets: [{ label: 'Soluções', data: sectors.map(item => item[1]), backgroundColor: '#8b5cf6', borderRadius: 6 }] }, options: { ...chartOptions, indexAxis: 'y', plugins: { ...chartOptions.plugins, legend: { display: false } } } });
}

function applyFilters() {
    const search = normalizeText(document.getElementById('solutionsSearch')?.value);
    const status = document.getElementById('solutionsStatusFilter')?.value || '';
    const type = document.getElementById('solutionsTypeFilter')?.value || '';
    const sector = document.getElementById('solutionsSectorFilter')?.value || '';
    filteredSolutions = solutions.filter(item => (!search || [item.nome,item.setor,item.responsavelNome,item.objetivo].some(value => normalizeText(value).includes(search))) && (!status || item.status === status) && (!type || item.tipo === type) && (!sector || item.setor === sector));
    renderTable();
}

function renderTable() {
    const body = document.getElementById('solutionsTableBody');
    const count = document.getElementById('solutionsTableCount');
    if (count) count.textContent = `${filteredSolutions.length.toLocaleString('pt-BR')} de ${solutions.length.toLocaleString('pt-BR')}`;
    if (!body) return;
    if (!filteredSolutions.length) { body.innerHTML = '<tr><td colspan="7" class="table-empty-state">Nenhuma solução encontrada.</td></tr>'; return; }
    const isAdmin = window.dashboardAuthorization?.role === 'admin' || ['localhost','127.0.0.1'].includes(location.hostname);
    body.innerHTML = filteredSolutions.map(item => `<tr>
        <td><code class="solution-id">${escapeHtml(item.id.slice(0, 8).toUpperCase())}</code></td>
        <td class="solution-name-cell"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(item.objetivo || 'Sem objetivo informado')}</small></td>
        <td>${escapeHtml(item.setor)}</td><td>${escapeHtml(item.responsavelNome)}</td><td><span class="table-badge">${escapeHtml(item.tipo)}</span></td>
        <td><span class="solution-status ${normalizeText(item.status).includes('desenvolvimento') ? 'is-progress' : 'is-finished'}">${escapeHtml(item.status)}</span></td>
        <td class="table-actions"><button class="table-edit-btn" type="button" data-solution-id="${item.id}"><i class="fa-solid fa-${isAdmin ? 'pen-to-square' : 'eye'}"></i> ${isAdmin ? 'Editar' : 'Ver'}</button></td>
    </tr>`).join('');
}

function historyHtml(history) {
    if (!history?.length) return '<li class="history-empty">Nenhuma alteração registrada.</li>';
    return [...history].reverse().map(entry => `<li class="solution-history-entry"><strong>${escapeHtml(new Date(entry.data).toLocaleString('pt-BR'))} · ${escapeHtml(entry.acao)}</strong><small>${escapeHtml(entry.usuario)} · ${escapeHtml(entry.origem)}</small>${(entry.alteracoes || []).map(change => `<span><b>${escapeHtml(labels[change.field] || change.field)}:</b> ${escapeHtml(change.de || '—')} → ${escapeHtml(change.para || '—')}</span>`).join('')}</li>`).join('');
}

function openEditor(id) {
    const solution = solutions.find(item => item.id === id);
    if (!solution) return;
    const form = document.getElementById('solutionEditForm');
    form.dataset.id = id;
    Object.keys(expectedHeaders).forEach(field => { const input = form.elements.namedItem(field); if (input) input.value = solution[field] || ''; });
    document.getElementById('solutionInternalId').textContent = id.toUpperCase();
    document.getElementById('solutionHistoryList').innerHTML = historyHtml(solution.historico);
    const isAdmin = window.dashboardAuthorization?.role === 'admin' || ['localhost','127.0.0.1'].includes(location.hostname);
    [...form.elements].forEach(element => { if (element.name) element.disabled = !isAdmin; });
    form.querySelector('[type="submit"]').hidden = !isAdmin;
    document.getElementById('solutionDialog').showModal();
}

async function loadSolutions() {
    const body = document.getElementById('solutionsTableBody');
    try {
        solutions = (await (await store()).list()).sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.nome.localeCompare(b.nome, 'pt-BR'));
        fillSelect('solutionsStatusFilter', solutions.map(item => item.status));
        fillSelect('solutionsTypeFilter', solutions.map(item => item.tipo));
        fillSelect('solutionsSectorFilter', solutions.map(item => item.setor));
        renderKpis(); renderCharts(); applyFilters();
    } catch (error) {
        console.error('Falha ao carregar soluções:', error);
        if (body) body.innerHTML = '<tr><td colspan="7" class="table-empty-state">Não foi possível carregar as soluções.</td></tr>';
    }
}

function setup() {
    const fileInput = document.getElementById('solutionsFileInput');
    const importButton = document.getElementById('solutionsImportButton');
    const importStatus = document.getElementById('solutionsImportStatus');
    const applyRole = () => { if (importButton) importButton.hidden = !(window.dashboardAuthorization?.role === 'admin' || ['localhost','127.0.0.1'].includes(location.hostname)); };
    applyRole();
    window.addEventListener('dashboard-auth-ready', applyRole);
    if (importButton) importButton.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0]; if (!file) return;
        importStatus.textContent = 'Lendo e validando a planilha…'; importStatus.className = 'solutions-import-status is-loading';
        try {
            const parsed = await parseWorkbook(file);
            const result = await (await store()).import(parsed.records, parsed.metadata);
            importStatus.textContent = `${result.total} processados · ${result.created} novos · ${result.updated} atualizados · ${result.unchanged} sem alteração`;
            importStatus.title = (result.updatedRecords || []).map(item => `${item.nome}: ${item.alteracoes.map(change => change.field).join(', ')}`).join('\n');
            importStatus.className = 'solutions-import-status is-success';
            await loadSolutions();
        } catch (error) {
            console.error('Falha na importação:', error);
            importStatus.textContent = error.message; importStatus.className = 'solutions-import-status is-error';
        } finally { fileInput.value = ''; }
    });
    ['solutionsSearch','solutionsStatusFilter','solutionsTypeFilter','solutionsSectorFilter'].forEach(id => document.getElementById(id)?.addEventListener(id === 'solutionsSearch' ? 'input' : 'change', applyFilters));
    document.getElementById('solutionsTableBody')?.addEventListener('click', event => { const button = event.target.closest('[data-solution-id]'); if (button) openEditor(button.dataset.solutionId); });
    document.getElementById('solutionDialogClose')?.addEventListener('click', () => document.getElementById('solutionDialog').close());
    document.getElementById('solutionEditForm')?.addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget;
        const changes = Object.fromEntries(Object.keys(expectedHeaders).map(field => [field, clean(form.elements.namedItem(field)?.value)]));
        try {
            await (await store()).update(form.dataset.id, changes);
            document.getElementById('solutionDialog').close(); await loadSolutions();
        } catch (error) { alert(error.message || 'Não foi possível salvar a solução.'); }
    });
    window.renderSolutionsDashboard = loadSolutions;
}

document.addEventListener('DOMContentLoaded', setup);
