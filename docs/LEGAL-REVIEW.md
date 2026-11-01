# GAMMS GROUP · Revisión previa a publicar el paquete legal

**Estado:** BORRADOR. No fusionar ni presentar las páginas como textos legales definitivos hasta completar la información y aprobarlas.

## Páginas propuestas
- `/aviso-legal/` · identidad y responsabilidad del operador.
- `/privacidad/` · tratamiento de datos del sitio y Secret ID.
- `/cookies/` · inventario verificado en código, terceros y gestión de preferencias.
- `/terminos/` · términos generales del sitio, sin sustituir contratos particulares.

Todas las páginas usan rutas de Cloudflare Pages con directorios `index.html`. La portada y el resto de páginas HTML reciben el panel de preferencias; las cuatro páginas legales lo incorporan directamente.

## Datos y decisiones imprescindibles antes de aprobar

- [ ] Identificar a la persona natural o entidad **real** titular del sitio (GAMMS GROUP puede ser solo un nombre comercial). Nunca inventar razón social, registro mercantil o RUC.
- [ ] Confirmar domicilio para notificaciones, correo real de contacto y correo real para privacidad. Verificar que reciben mensajes y tienen responsable de respuesta.
- [ ] Revisar qué empresas, productos o entidades del grupo actúan efectivamente como responsable/encargado de cada tratamiento.
- [ ] Auditar operaciones reales del sitio en producción (cookies, localStorage, integraciones, scripts y Cloudflare) con navegador limpio, con y sin sesión, en desktop y móvil.
- [ ] Completar inventario y plazos de conservación de cuentas, actividad, seguridad, solicitudes y copias de respaldo. El código actual define 30 días para la cookie y las sesiones de Secret ID.
- [ ] Verificar el tratamiento y transferencia de información por Google y Cloudflare y sus condiciones/contratos aplicables.
- [ ] Diseñar un mecanismo operativo para responder a solicitudes sobre datos: verificación proporcionada de identidad, acceso, rectificación, cancelación/bloqueo y registro de respuesta.
- [ ] Confirmar obligaciones administrativas de inscripción de ficheros de datos, seguridad y otras bajo la Ley 787 y Decreto 36-2012, con asesoría local.
- [ ] Revisar la aplicabilidad de Ley 842 si se vende o contrata por medios electrónicos. Añadir precio, medios de reclamo, domicilio y condiciones específicas antes de activar compras.
- [ ] Preparar **avisos separados** para GAMMS MDM, dispositivos administrados y geolocalización; no basta la política de la web corporativa.
- [ ] Validar requisitos de menores de edad si se permite el registro y tratamiento de sus datos.
- [ ] Pedir revisión jurídica local. Quitar etiquetas «Borrador» y `noindex` **solo tras aprobar y completar** los textos.

## Consentimiento y scripts

- `/legal/cookie-consent.js` guarda `gamms-consent-v1` en localStorage. La API `window.GAMMSConsent.get()` y `window.GAMMSConsent.has('analytics'|'marketing')` permite condicionar integraciones futuras.
- No añade scripts de analítica ni marketing. Los controles «Aceptar todas» y «Rechazar opcionales» registran únicamente las opciones seleccionadas.
- El script de autenticación de Google se solicita desde `home-v2.js` cuando el usuario abre el inicio de sesión, no en el `<head>` de la portada.
- **Importante:** antes de agregar scripts opcionales en el futuro, condicionar su carga a una decisión previa y evitar cookies antes del consentimiento. También documentar cómo se desactivan o eliminan las cookies que coloque el proveedor al retirar consentimiento. Guardar pruebas del consentimiento si una finalidad lo requiere.
- La cookie `GAMMS-ACCOUNT-SESSION` es necesaria exclusivamente cuando se inicia sesión; `HttpOnly; Secure; SameSite=Lax`, máximo 30 días según `functions/api/account/google.js`.

## Validación técnica mínima

1. Abrir en modo privado `/`, `/aviso-legal/`, `/privacidad/`, `/cookies/`, `/terminos/` y una página de producto: comprobar banner inicial y enlaces.
2. Rechazar opcionales: debe ocultarse el banner y permanecer la elección tras recargar.
3. Usar «Configurar cookies»: debe abrir el diálogo, permitir guardar cambios y no modificar la sesión existente.
4. Recargar la página con accesibilidad/teclado: botones y casillas se pueden enfocar; Esc cierra el diálogo.
5. Verificar que en una visita inicial no se solicita `accounts.google.com/gsi/client` y que al pulsar inicio de sesión sí se carga.
6. Verificar en DevTools que las categorías opcionales **no** generan solicitudes de analítica o publicidad antes de consentir.
7. Confirmar que Cloudflare Pages Functions e integración Secret ID siguen funcionando y que las rutas HTML se entregan bien.
8. Ejecutar `npm test` y verificar los flujos con un navegador real en un despliegue de previsualización.

## Bases jurídicas consultadas

- Ley No. 787, Protección de Datos Personales: https://www.leybook.com/doc/11606
- Decreto 36-2012, Reglamento de la Ley 787: https://www.leybook.com/doc/7686
- Ley No. 842, texto consolidado de protección a personas consumidoras y usuarias: https://www.leybook.com/doc/30861

Estas referencias son información para la revisión, **no** certificación de cumplimiento normativo.
