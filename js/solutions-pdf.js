export const solutionPdfFields = [
    ['id', 'ID interno'], ['nome', 'Solução'], ['motivo', 'Motivo'], ['objetivo', 'Objetivo'],
    ['setor', 'Setor'], ['responsavelNome', 'Responsável'], ['responsavelId', 'ID do responsável'],
    ['tipo', 'Tipo'], ['status', 'Status'], ['data', 'Data'], ['querySql', 'Query SQL'],
    ['numeroComunicado', 'Número do comunicado']
];

const text = value => String(value ?? '').trim() || 'Não informado';
const formatDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value);
};

export function catalogPdfTitle(sector) {
    return `Catálogo de soluções - ${text(sector || 'Todos os setores')}`;
}

export function catalogPdfFileName(sector) {
    const segment = text(sector || 'todos-os-setores').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return `catalogo-de-solucoes-${segment || 'todos-os-setores'}.pdf`;
}

export function exportSolutionsPdf(records, context, JsPdf) {
    if (!records.length) throw new Error('Não há soluções para exportar com os filtros atuais.');
    if (!JsPdf) throw new Error('O gerador de PDF ainda não foi carregado.');
    const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    const header = () => {
        doc.setFillColor(20, 15, 36); doc.rect(0, 0, pageWidth, 27, 'F');
        doc.setTextColor(245, 243, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
        doc.text(catalogPdfTitle(context.sector), margin, 12);
        doc.setTextColor(188, 177, 218); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        const filters = [`${records.length} registro(s)`, context.period || 'Todo o período', context.status ? `Status: ${context.status}` : '', context.type ? `Tipo: ${context.type}` : '', context.search ? `Busca: ${context.search}` : ''].filter(Boolean).join('  |  ');
        doc.text(filters, margin, 20, { maxWidth: contentWidth });
        y = 34;
    };
    const newPage = () => { doc.addPage(); header(); };
    const ensure = height => { if (y + height > pageHeight - 14) newPage(); };
    const writeField = (label, value) => {
        const content = label === 'Data' ? formatDate(value) : text(value);
        const lines = doc.splitTextToSize(content, contentWidth - 6);
        ensure(8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(108, 76, 190); doc.text(label.toUpperCase(), margin + 3, y);
        y += 4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(42, 37, 57);
        for (const line of lines) { ensure(4.3); doc.text(line, margin + 3, y); y += 4.3; }
        y += 2;
    };

    header();
    records.forEach((record, index) => {
        ensure(18);
        doc.setFillColor(244, 241, 250); doc.roundedRect(margin, y - 5, contentWidth, 11, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(25, 20, 38);
        doc.text(`${index + 1}. ${text(record.nome)}`, margin + 3, y + 1.5, { maxWidth: contentWidth - 6 });
        y += 11;
        solutionPdfFields.filter(([field]) => field !== 'nome').forEach(([field, label]) => writeField(label, record[field]));
        y += 2; doc.setDrawColor(220, 214, 232); doc.line(margin, y, pageWidth - margin, y); y += 7;
    });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 112, 139);
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }
    doc.save(catalogPdfFileName(context.sector));
}
