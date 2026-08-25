import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const enrichedJs = readFileSync(new URL('../js/enriched-metrics-dashboard.js', import.meta.url), 'utf8');
const attributes = (name, source = html) => [...source.matchAll(new RegExp(`\\b${name}="([^"]+)"`, 'g'))].map(match => match[1]);
const ids = attributes('id'); const idSet = new Set(ids);

test('dashboard não possui IDs duplicados', () => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual([...new Set(duplicates)], []);
});

test('todos os destinos do menu existem', () => {
    attributes('data-target').forEach(target => assert.ok(idSet.has(target), `Destino ausente: ${target}`));
});

test('referências aria-labelledby apontam para elementos existentes', () => {
    attributes('aria-labelledby').flatMap(value => value.split(/\s+/)).forEach(target => assert.ok(idSet.has(target), `Referência ARIA ausente: ${target}`));
});

test('elementos consumidos pelo painel enriquecido existem no HTML', () => {
    const used = [...enrichedJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
    used.forEach(target => assert.ok(idSet.has(target), `Elemento do painel enriquecido ausente: ${target}`));
});

test('abas dimensionais e filtros de inatividade possuem nomes acessíveis', () => {
    const dimensionButtons = [...html.matchAll(/<button[^>]+data-operational-dimension[^>]*>/g)].map(match => match[0]);
    assert.equal(dimensionButtons.length, 4); dimensionButtons.forEach(button => { assert.match(button, /role="tab"/); assert.match(button, /aria-selected="(?:true|false)"/); });
    ['stalePriorityFilter', 'staleOperatorFilter', 'staleCategoryFilter', 'staleDepartmentFilter'].forEach(id => assert.match(html, new RegExp(`<select[^>]+id="${id}"[^>]+aria-label="[^"]+"`)));
});
