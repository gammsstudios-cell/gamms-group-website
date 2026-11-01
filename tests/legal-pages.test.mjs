import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('cuatro páginas legales coherentes y con contacto real', () => {
  const contact = {
    'aviso-legal': 'legal@gammsgroup.top',
    privacidad: 'privacidad@gammsgroup.top',
    cookies: 'privacidad@gammsgroup.top',
    terminos: 'legal@gammsgroup.top'
  };
  for (const [slug, email] of Object.entries(contact)) {
    const html = read(slug + '/index.html');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<article class="doc-content">/);
    assert.match(html, /cookie-consent\.js/);
    assert.match(html, /gamms-mark\.svg/);
    assert.ok(html.includes(email));
    assert.ok(html.includes('noindex,nofollow')); // Información provisional.
    assert.doesNotMatch(html, /\[CORREO DE (PRIVACIDAD|CONTACTO) PENDIENTE\]/);
  }
});

test('portada enlaza a todos los documentos y usa vector SVG', () => {
  const html = read('index.html');
  for (const slug of ['aviso-legal', 'privacidad', 'cookies', 'terminos']) {
    assert.ok(html.includes('href="/' + slug + '/"'));
  }
  assert.match(html, /assets\/gamms-mark\.svg/);
  assert.match(read('assets/gamms-mark.svg'), /<svg /);
  assert.match(html, /data-cookie-settings/);
  assert.doesNotMatch(html, /<script src="https:\/\/accounts\.google\.com\/gsi\/client"/);
});

test('cookies: aviso necesario, sin controles ficticios de marketing', () => {
  const js = read('legal/cookie-consent.js');
  assert.match(js, /gamms-cookie-notice-v2/);
  assert.match(js, /noticeAcknowledged/);
  assert.match(js, /data-cookie-settings/);
  assert.match(js, /gamms:consentchange/);
  assert.match(js, /window\.GAMMSConsent/);
  assert.doesNotMatch(js, /Aceptar todas|Rechazar opcionales/);
  assert.match(read('cookies/index.html'), /gamms-cookie-notice-v2/);
});

test('Google Identity se carga bajo demanda', () => {
  const js = read('home-v2.js');
  assert.match(js, /s\.src='https:\/\/accounts\.google\.com\/gsi\/client'/);
  assert.match(js, /function waitForGoogle\(\)/);
});

test('cookie de Secret ID coincide con los textos', () => {
  const session = read('functions/api/account/google.js');
  const cookies = read('cookies/index.html');
  assert.match(session, /GAMMS-ACCOUNT-SESSION/);
  assert.match(cookies, /GAMMS-ACCOUNT-SESSION/);
  assert.match(session, /60 \* 60 \* 24 \* 30/);
  assert.match(cookies, /30 días/);
});

test('Secret ID se describe como opcional y no inventa empresa', () => {
  const privacy = read('privacidad/index.html');
  const terms = read('terminos/index.html');
  assert.match(privacy, /opcional/);
  assert.match(terms, /opcional/);
  assert.match(terms, /no constituido como sociedad mercantil/);
  assert.match(privacy, /privacidad@gammsgroup\.top/);
});
