import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const canonical = {
  'index.html': 'https://gammsgroup.top/',
  'gma-64/index.html': 'https://gammsgroup.top/gma-64/',
  'secretos/index.html': 'https://gammsgroup.top/secretos/'
};
test('los documentos indexables utilizan canonical de gammsgroup.top', () => {
  for (const [path,url] of Object.entries(canonical)){
    const html = read(path);
    assert.ok(html.includes('rel="canonical" href="' + url + '"'));
    assert.ok(html.includes('index,follow'));
    assert.doesNotMatch(html, /gammsgroup\.pages\.dev/);
  }
});
test('sitemap XML incluye solo páginas indexables del sitio', () => {
 const sitemap = read('sitemap.xml');
 assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
 assert.doesNotMatch(sitemap, /pages\.dev|aviso-legal|privacidad|cookies|terminos/);
 for(const url of Object.values(canonical)) assert.ok(sitemap.includes('<loc>'+url+'</loc>'));
});
test('robots permite rastreo y anuncia sitemap correcto', () => {
 const robots = read('robots.txt');
 assert.match(robots, /User-agent: \*/);
 assert.match(robots, /Allow: \//);
 assert.match(robots, /Sitemap: https:\/\/gammsgroup\.top\/sitemap\.xml/);
 assert.doesNotMatch(robots, /pages\.dev/);
});
test('portada contiene nombre GAMMSGROUP y schema válido de WebSite', () => {
 const html = read('index.html');
 assert.match(html, /GAMMSGROUP/);
 const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
 assert.ok(match);
 const schema=JSON.parse(match[1]);
 assert.equal(schema['@type'], 'WebSite');
 assert.equal(schema.name, 'GAMMS GROUP');
 assert.ok(schema.alternateName.includes('GAMMSGROUP'));
 assert.equal(schema.url,'https://gammsgroup.top/');
});
test('páginas legales provisionales continúan sin indexación', () => {
 for(const slug of ['aviso-legal','privacidad','cookies','terminos']){
  assert.match(read(slug+'/index.html'),/name="robots" content="noindex,nofollow"/);
 }
});
