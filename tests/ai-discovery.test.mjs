import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PUBLIC_URL = 'https://gammsgroup.top/empresa/';
const PRIVATE_PREFIXES = ['/api/', '/aep/', '/mdm/', '/controlcenter/', '/admin/', '/account/', '/cdn-cgi/'];

function robotsGroup(robots, agent) {
  const groups = robots.split(/\n\s*\n/).map(section =>
    section.split('\n').map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
  );
  return groups.find(group => group[0]?.toLowerCase() === 'user-agent: ' + agent.toLowerCase());
}

test('ChatGPT Search y Bing pueden rastrear páginas públicas sin abrir rutas privadas', () => {
  const robots = read('robots.txt');
  for (const agent of ['*', 'OAI-SearchBot', 'bingbot']) {
    const group = robotsGroup(robots, agent);
    assert.ok(group, 'Falta sección ' + agent);
    assert.ok(group.includes('Allow: /'), 'Falta permitir raíz para ' + agent);
    for (const path of PRIVATE_PREFIXES) {
      assert.ok(group.includes('Disallow: ' + path), agent + ' debería omitir ' + path);
    }
  }
  const training = robotsGroup(robots, 'GPTBot');
  assert.ok(training, 'No hay regla explícita de GPTBot');
  assert.ok(training.includes('Disallow: /'), 'GPTBot debe estar bloqueado en todo el sitio');
  assert.ok(!training.includes('Allow: /'), 'GPTBot no debe tener un permiso contradictorio');
  assert.match(robots, /Sitemap: https:\/\/gammsgroup\.top\/sitemap\.xml/);
});

test('ficha corporativa pública es indexable, canónica y contiene información verificable', () => {
  const page = read('empresa/index.html');
  assert.match(page, /<html lang="es">/);
  assert.match(page, /<h1 id="empresa-titulo">¿Qué es <span>GAMMS GROUP<\/span>\?<\/h1>/);
  assert.match(page, /name="robots" content="index,follow/);
  assert.match(page, /rel="canonical" href="https:\/\/gammsgroup\.top\/empresa\/"/);
  assert.match(page, /<meta name="description" content="¿Qué es GAMMS GROUP\?/);
  for (const path of ['/secretos/', '/gma-64/', '/#products', '/aviso-legal/']) {
    assert.ok(page.includes('href="' + path + '"'), 'Falta enlace a ' + path);
  }
  for (const phrase of ['GAMMS MDM', 'SecretOS', 'GMA-64', 'GAMMS.UI', 'Managua, Nicaragua']) {
    assert.ok(page.includes(phrase), 'Falta información pública: ' + phrase);
  }
  assert.match(page, /todavía no constituido como sociedad mercantil/);
  assert.doesNotMatch(page, /(?:contraseña|token secreto|credencial de producción|clave API):\s*\S+/i);
});

test('AboutPage referencia la identidad única de Organization y WebSite', () => {
  const page = read('empresa/index.html');
  const home = read('index.html');
  const parseSchemas = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const schema = parseSchemas(page).find(item => item['@type'] === 'AboutPage');
  const org = parseSchemas(home).find(item => item['@type'] === 'Organization');
  const website = parseSchemas(home).find(item => item['@type'] === 'WebSite');
  assert.ok(schema && org && website);
  assert.equal(schema.url, PUBLIC_URL);
  assert.equal(schema.mainEntity['@id'], org['@id']);
  assert.equal(schema.isPartOf['@id'], website['@id']);
  assert.equal(schema.publisher['@id'], org['@id']);
  assert.equal(org.subjectOf['@id'], schema['@id']);
});

test('sitemap y portada promocionan solo la ficha pública, no portales privados', () => {
  const sitemap = read('sitemap.xml');
  const home = read('index.html');
  const redirects = read('_redirects');
  assert.equal(sitemap.split('<loc>' + PUBLIC_URL + '</loc>').length - 1, 1);
  assert.ok(home.includes('href="/empresa/"'));
  assert.match(redirects, /^\/empresa \/empresa\/ 301$/m);
  for (const path of PRIVATE_PREFIXES) assert.ok(!sitemap.includes('<loc>https://gammsgroup.top' + path));
});

test('las páginas legales continúan excluidas de indexación', () => {
  for (const path of ['aviso-legal', 'privacidad', 'cookies', 'terminos']) {
    assert.match(read(path + '/index.html'), /name="robots" content="noindex,nofollow"/);
  }
});
