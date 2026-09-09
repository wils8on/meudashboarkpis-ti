import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogPdfFileName, catalogPdfTitle, exportSolutionsPdf, solutionPdfFields } from '../js/solutions-pdf.js';

test('título do PDF identifica o setor filtrado', () => {
    assert.equal(catalogPdfTitle('Comercial'), 'Catálogo de soluções - Comercial');
    assert.equal(catalogPdfTitle(''), 'Catálogo de soluções - Todos os setores');
    assert.equal(catalogPdfFileName('Inovação / TI'), 'catalogo-de-solucoes-inovacao-ti.pdf');
});

test('PDF contempla todas as colunas do cadastro de soluções', () => {
    assert.deepEqual(solutionPdfFields.map(([field]) => field), ['id', 'nome', 'motivo', 'objetivo', 'setor', 'responsavelNome', 'responsavelId', 'tipo', 'status', 'data', 'querySql', 'numeroComunicado']);
});

test('exportação usa somente os registros recebidos e grava nome do setor', () => {
    const written = []; let savedAs = '';
    class FakePdf {
        constructor() { this.internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } }; }
        setFillColor() {} rect() {} setTextColor() {} setFont() {} setFontSize() {} addPage() {} roundedRect() {} setDrawColor() {} line() {} setPage() {}
        splitTextToSize(value) { return [String(value)]; }
        text(value) { written.push(String(value)); }
        getNumberOfPages() { return 1; }
        save(value) { savedAs = value; }
    }
    exportSolutionsPdf([{ id: 'ABC123', nome: 'Painel comercial', motivo: 'Acompanhar vendas', objetivo: 'Dar visibilidade', setor: 'Comercial', responsavelNome: 'Wilson', responsavelId: '10', tipo: 'Dashboard', status: 'Finalizado', data: '2026-09-08', querySql: 'select 1', numeroComunicado: '42' }], { sector: 'Comercial', period: 'Todo o período' }, FakePdf);
    assert.ok(written.includes('Catálogo de soluções - Comercial'));
    ['ABC123', 'Painel comercial', 'Acompanhar vendas', 'Dar visibilidade', 'Comercial', 'Wilson', '10', 'Dashboard', 'Finalizado', '08/09/2026', 'select 1', '42'].forEach(value => assert.ok(written.some(line => line.includes(value)), `Valor ausente no PDF: ${value}`));
    assert.equal(savedAs, 'catalogo-de-solucoes-comercial.pdf');
});
