# Visibilidad de GAMMS GROUP para buscadores e inteligencias artificiales

**URL pública de identidad:** https://gammsgroup.top/empresa/

## Alcance implementado

- Ficha corporativa HTML pública con respuesta a «¿Qué es GAMMS GROUP?», proyectos enlazados, ubicación publicada en **Managua, Nicaragua** y correo público soporte@gammsgroup.top.
- La ficha usa datos estructurados AboutPage y se enlaza mediante @id con Organization y WebSite ya existentes en la portada.
- La portada enlaza a /empresa/ y sitemap.xml incluye la URL canónica; /empresa redirige a /empresa/.
- robots.txt permite a OAI-SearchBot (ChatGPT Search), bingbot y los buscadores generales acceder al contenido público; restringe el rastreo de los prefijos internos conocidos y especifica User-agent: GPTBot / Disallow: /.
- Los archivos de autenticación, API, middleware y bases de datos no se han modificado para esta integración.
- El aviso legal existente indica que GAMMS GROUP todavía no es sociedad mercantil constituida. La ficha pública refleja ese estado, sin inventar registros o certificaciones.

## Límites de la configuración

- OAI-SearchBot y GPTBot son controles independientes según OpenAI. Bloquear GPTBot comunica la preferencia de que el contenido rastreado no se use para entrenar modelos fundacionales de OpenAI sin impedir que OAI-SearchBot lo descubra para búsqueda.
- El bloqueo de GPTBot no es una prohibición universal a todos los rastreadores o modelos de terceros. Tampoco borra información previamente conocida.
- robots.txt regula el rastreo de bots cooperativos. NO asegura privacidad, no protege recursos sin sesión, no sustituye controles de acceso ni evita ataques. Los portales privados deben exigir autenticación y autorización real del lado del servidor.
- La indexación, clasificación y citación por ChatGPT, Bing, Copilot, Google u otras IA no está garantizada.
- No se crearon fichas sociales falsas, datos mercantiles no verificados, dirección privada, fuentes inventadas o credenciales.

## Después de publicar en Cloudflare Pages

1. Confirmar que el despliegue de main finalizó y que https://gammsgroup.top/empresa/, /robots.txt y /sitemap.xml responden HTTP 200 públicamente.
2. Confirmar que /empresa/ muestra contenido legible sin iniciar sesión y /empresa redirige a la URL canónica.
3. Revisar que Cloudflare WAF/Bot Management no bloquee a OAI-SearchBot (desde IPs oficiales de OpenAI) y bingbot. No abrir API ni rutas privadas para ello.
4. En Google Search Console, inspeccionar https://gammsgroup.top/empresa/, probar la URL publicada y solicitar indexación. Enviar o actualizar https://gammsgroup.top/sitemap.xml.
5. En Bing Webmaster Tools, verificar la titularidad de gammsgroup.top, enviar el mismo sitemap y comprobar el estado de las URL. Este paso requiere acceso humano a la cuenta y no lo realiza GitHub.
6. Medir las consultas de marca GAMMS GROUP, GAMMS y GAMMSGROUP en Search Console y apariciones/citas cuando se disponga de herramientas de Bing.

## Referencias de proveedores

- OpenAI: https://developers.openai.com/api/docs/bots
- IPs de OAI-SearchBot: https://openai.com/searchbot.json
- Bing Webmaster Guidelines: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
- Bing Webmaster Tools: https://www.bing.com/webmasters/
- Google, site names: https://developers.google.com/search/docs/appearance/site-names

**Nota:** guardar estas reglas y la ficha en GitHub no demuestra por sí solo que Cloudflare haya publicado los archivos ni que los buscadores ya los hayan indexado.
