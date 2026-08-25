import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('animação tecnológica do login é decorativa e leve', () => {
    assert.match(html, /class="tech-scene" aria-hidden="true"/);
    assert.match(html, /class="circuit-map"/);
    assert.doesNotMatch(html, /<(?:video|canvas)\b/i);
});

test('login respeita preferência por movimento reduzido', () => {
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(html, /animation: none !important/);
});

test('login mantém ação principal identificável', () => {
    assert.match(html, /id="btnGoogleLogin"/);
    assert.match(html, />\s*Conectar com Google\s*</);
});

test('nova experiência é propagada pelo cache do PWA', () => {
    assert.match(serviceWorker, /CACHE_NAME = 'painel-kpi-v24'/);
    assert.match(serviceWorker, /\.\/index\.html/);
});
