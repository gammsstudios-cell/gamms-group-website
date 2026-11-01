import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('las cuatro rutas legales son páginas HTML completas', () => {
  for (const slug of ['aviso-legal', 'privacidad', 'cookies', 'terminos']) {
    const html = read(slug + '/index.html');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<main id="main"/);
    assert.match(html, /<article class="doc-content">/);
    assert.match(html, /cookie-consent\.js/);
    assert.match(html, /pendiente|PENDIENTE/i); // No presentar borrador como definitivo.
  }
});

test('la portada enlaza a páginas legales y preferencias', () => {
  const html = read('index.html');
  for (const slug of ['aviso-legal', 'privacidad', 'cookies', 'terminos']) {
    assert.ok(html.includes('href="/' + slug + '/"'));
  }
  assert.match(html, /data-cookie-settings/);
  assert.doesNotMatch(html, /<script src="https:\/\/accounts\.google\.com\/gsi\/client"/);
});

test('consentimiento opcional por defecto y reconfigurable', () => {
  const js = read('legal/cookie-consent.js');
  assert.match(js, /gamms-consent-v1/);
  assert.match(js, /decision\(false, false\)/);
  assert.match(js, /data-cookie-settings/);
  assert.match(js, /gamms:consentchange/);
  assert.match(js, /window\.GAMMSConsent/);
});

test('Google Identity se carga solo al iniciar el flujo de acceso', () => {
  const js = read('home-v2.js');
  assert.match(js, /s\.src='https:\/\/accounts\.google\.com\/gsi\/client'/);
  assert.match(js, /function waitForGoogle\(\)/);
});

test('la cookie real de Secret ID coincide con la política publicada', () => {
  const session = read('functions/api/account/google.js');
  const cookies = read('cookies/index.html');
  assert.match(session, /GAMMS-ACCOUNT-SESSION/);
  assert.match(cookies, /GAMMS-ACCOUNT-SESSION/);
  assert.match(session, /60 \* 60 \* 24 \* 30/);
  assert.match(cookies, /30 días/);
});
