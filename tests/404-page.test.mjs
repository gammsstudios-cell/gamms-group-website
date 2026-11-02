import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('404 de Cloudflare Pages existe en la raíz, con SEO seguro', () => {
  const html = read('404.html');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>404 — Página no encontrada \| GAMMS GROUP<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex,follow"/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/#products"/);
  assert.match(html, /src="\/assets\/gamms-mark\.svg"/);
});

test('404 funciona en rutas profundas y no inyecta HTML de URL', () => {
  const html = read('404.html');
  assert.match(html, /<style>[\s\S]*<\/style>/);
  assert.match(html, /@media\(max-width:600px\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /getElementById\('requested-path'\)\.textContent = location\.pathname/);
  assert.doesNotMatch(html, /innerHTML\s*=\s*location/);
  assert.doesNotMatch(read('sitemap.xml'), /<loc>https:\/\/gammsgroup\.top\/404/);
});

test('middleware no inyecta scripts de la portada en respuestas 404', () => {
  const middleware = read('functions/_middleware.js');
  assert.match(middleware, /response\.status\s*>=\s*400/);
  assert.match(middleware, /url\.pathname\s*===\s*'\/404\.html'/);
});
