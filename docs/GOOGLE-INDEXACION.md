# Hacer que GAMMS GROUP aparezca en Google

Dominio oficial: **https://gammsgroup.top/**

## Cambios técnicos aplicados
- Canonicals de la portada, `/gma-64/` y `/secretos/` apuntan a `gammsgroup.top`.
- `/robots.txt` permite el rastreo y anuncia `https://gammsgroup.top/sitemap.xml`.
- `/sitemap.xml` contiene solo las tres URL públicas que queremos indexar; no se incluyen documentos legales con `noindex` provisional.
- La portada tiene título y descripción como empresa privada de tecnología, Open Graph/Twitter y una introducción visible acorde.
- `WebSite` define seis nombres alternativos ordenados: GAMMS, GAMMSGROUP, Gamms Group, Grupo GAMMS, GammsGroup y Group for Advanced Modular Multiplatform Systems.
- `Organization` usa la misma identidad, el logo público y una descripción empresarial; no inventa razón social, registro legal, teléfono ni perfiles sociales.
- No se inventa una empresa constituida, dirección física, teléfono o perfil en redes.

## Estado de indexación

El 6 de noviembre de 2026, Search Console indicó «La URL está en Google» para la portada (captura facilitada por el propietario). Tras publicar esta actualización, se puede solicitar un nuevo rastreo de la página principal y supervisar consultas de marca en el informe de Rendimiento. Los `alternateName` no garantizan ranking.

## Google Search Console: verificación y seguimiento

1. Entrar a https://search.google.com/search-console con la cuenta Google que controlará el sitio.
2. Elegir **Añadir propiedad** → **Dominio** e introducir `gammsgroup.top` **sin** https:// ni barras.
3. Copiar el registro TXT de verificación **exactamente** como lo entregue Google: el valor real es único, no se debe adivinar.
4. Ir a **Cloudflare** → `gammsgroup.top` → **DNS** → **Records** → **Add record**:
   - Type: TXT
   - Name: @
   - Content: el código completo `google-site-verification=...` proporcionado por Google
   - TTL: Auto
   No borrar ni reemplazar MX/SPF/DKIM existentes de Email Routing.
5. Regresar a Search Console y pulsar **Verificar**. Si el TXT todavía no ha propagado, volver a comprobar más tarde.
6. Abrir **Indexación → Sitemaps**, añadir `sitemap.xml` y pulsar **Enviar**.
7. Usar **Inspección de URL** con `https://gammsgroup.top/`, ejecutar **Probar URL publicada** y, si es accesible, **Solicitar indexación**. Repetir, si procede, con `/secretos/` y `/gma-64/`.
8. Consultar el informe de **Páginas** y el de **Rendimiento** para detectar problemas de rastreo e indexación.

## Precauciones
- `site:gammsgroup.top` puede tardar en mostrar resultados; no constituye prueba definitiva de si una URL está indexada. **Search Console** es la fuente principal para ese diagnóstico.
- Solicitar indexación o enviar un sitemap **no garantiza** que Google muestre el sitio ni una posición determinada; normalmente puede tomar días o semanas.
- Comprobar que Cloudflare Pages desplegó `main` y que `/robots.txt` y `/sitemap.xml` devuelven HTTP 200, sin pantalla de inicio de sesión, CAPTCHA ni bloqueos de robots.
- No quitar `noindex` de `/aviso-legal/`, `/privacidad/`, `/cookies/` o `/terminos/` hasta completar la identificación legal y aprobar los textos.

Referencias:
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://support.google.com/webmasters/answer/9008080?hl=es

- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/appearance/structured-data/organization
