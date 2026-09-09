export const solutionPdfFields = [
    ['nome', 'Solução'], ['setor', 'Setor'], ['responsavelNome', 'Responsável'], ['tipo', 'Tipo'], ['status', 'Status']
];

const text = value => String(value ?? '').trim() || 'Não informado';

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

    const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const tableWidth = pageWidth - margin * 2;
    const widths = [82, 26, 30, 25, tableWidth - 163];
    const headers = solutionPdfFields.map(([, label]) => label);
    let y = 0;

    const drawPageHeader = () => {
        doc.setFillColor(20, 15, 36); doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(245, 243, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
        doc.text(catalogPdfTitle(context.sector), margin, 11);
        doc.setTextColor(188, 177, 218); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        const filters = [`${records.length} registro(s)`, context.period || 'Todo o período', context.status ? `Status: ${context.status}` : '', context.type ? `Tipo: ${context.type}` : '', context.search ? `Busca: ${context.search}` : ''].filter(Boolean).join('  |  ');
        doc.text(filters, margin, 18, { maxWidth: tableWidth });
        y = 31;
    };

    const drawTableHeader = () => {
        doc.setFillColor(42, 33, 62); doc.rect(margin, y, tableWidth, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
        let x = margin;
        headers.forEach((header, index) => { doc.text(header.toUpperCase(), x + 2, y + 5); x += widths[index]; });
        y += 8;
    };

    const newPage = () => { doc.addPage(); drawPageHeader(); drawTableHeader(); };
    drawPageHeader(); drawTableHeader();

    records.forEach((record, index) => {
        const solutionLines = doc.splitTextToSize(text(record.nome), widths[0] - 4);
        const descriptionLines = doc.splitTextToSize(text(record.objetivo), widths[0] - 4);
        const cells = [solutionLines, ...solutionPdfFields.slice(1).map(([field], columnIndex) => doc.splitTextToSize(text(record[field]), widths[columnIndex + 1] - 4))];
        const solutionHeight = solutionLines.length * 3.7 + descriptionLines.length * 3.1 + 3;
        const rowHeight = Math.max(11, solutionHeight, ...cells.slice(1).map(lines => lines.length * 3.7 + 4));
        if (y + rowHeight > pageHeight - 13) newPage();
        if (index % 2 === 0) { doc.setFillColor(248, 246, 251); doc.rect(margin, y, tableWidth, rowHeight, 'F'); }
        doc.setDrawColor(225, 221, 232); doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
        let x = margin;
        doc.setTextColor(37, 31, 52); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        doc.text(solutionLines, x + 2, y + 4.5);
        doc.setTextColor(116, 108, 132); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2);
        doc.text(descriptionLines, x + 2, y + 4.5 + solutionLines.length * 3.7);
        x += widths[0];
        cells.slice(1).forEach((lines, cellIndex) => {
            doc.setTextColor(62, 55, 78); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
            doc.text(lines, x + 2, y + 5); x += widths[cellIndex + 1];
        });
        y += rowHeight;
    });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 112, 139);
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }
    doc.save(catalogPdfFileName(context.sector));
}
