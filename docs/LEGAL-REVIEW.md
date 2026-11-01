# GAMMS GROUP · Revisión previa a publicar el paquete legal

**Estado:** PÁGINAS INFORMATIVAS PROVISIONALES. Se pueden presentar como información sobre prácticas reales, pero no como constancia de cumplimiento legal completo. Falta validar e identificar al responsable real del fichero Secret ID y el domicilio apropiado. Mantener `noindex` hasta terminar esa parte.

**Confirmado el 1 de noviembre de 2026 por el promotor:** GAMMS GROUP **todavía no está constituido ni registrado como empresa**. Debe tratarse como denominación de un proyecto, nunca como sociedad mercantil existente. No inventar personalidad jurídica, registro mercantil, RUC empresarial ni representante corporativo. Esta constatación no resuelve quién es el responsable individual ni el estatus registral/fiscal que pudiera corresponderle.

## Páginas propuestas
- `/aviso-legal/` · identidad y responsabilidad del operador.
- `/privacidad/` · tratamiento de datos del sitio y Secret ID.
- `/cookies/` · inventario verificado en código, terceros y gestión de preferencias.
- `/terminos/` · términos generales del sitio, sin sustituir contratos particulares.

Todas las páginas usan rutas de Cloudflare Pages con directorios `index.html`. La portada y el resto de páginas HTML reciben el panel de preferencias; las cuatro páginas legales lo incorporan directamente.

## Datos y decisiones imprescindibles antes de aprobar

- [ ] Identificar y verificar a la persona natural o personas **reales** responsables del sitio y del fichero de Secret ID. GAMMS GROUP es actualmente un proyecto no constituido: no poner razón social, registro mercantil, RUC ni representaciones inventadas.
- [x] Contactos de recepción configurados en Cloudflare: `privacidad@gammsgroup.top`, `legal@gammsgroup.top` y `soporte@gammsgroup.top`, todos redirigidos al Gmail de destino. El usuario confirmó recepción de los tres correos de prueba el 1 de noviembre de 2026; uno llegó a Spam y se solicitó marcarlo como «No es spam».
- [ ] Designar a la persona que atenderá las solicitudes y establecer un procedimiento de seguimiento, respuesta y protección de datos en correos.
- [ ] Confirmar un domicilio apto para notificaciones. **Evitar divulgar automáticamente el domicilio residencial o datos personales del promotor**; consultar con asesor local la solución que cumpla los requisitos de información de la Ley 787.
- [ ] Revisar qué empresas, productos o entidades del grupo actúan efectivamente como responsable/encargado de cada tratamiento.
- [ ] Auditar operaciones reales del sitio en producción (cookies, localStorage, integraciones, scripts y Cloudflare) con navegador limpio, con y sin sesión, en desktop y móvil.
- [ ] Completar inventario y plazos de conservación de cuentas, actividad, seguridad, solicitudes y copias de respaldo. El código actual define 30 días para la cookie y las sesiones de Secret ID.
- [ ] Verificar el tratamiento y transferencia de información por Google y Cloudflare y sus condiciones/contratos aplicables.
- [ ] Diseñar un mecanismo operativo para responder a solicitudes sobre datos: verificación proporcionada de identidad, acceso, rectificación, cancelación/bloqueo y registro de respuesta.
- [ ] Confirmar obligaciones administrativas de inscripción de ficheros de datos, seguridad y otras bajo la Ley 787 y Decreto 36-2012, con asesoría local.
- [ ] Revisar la aplicabilidad de Ley 842 si se vende o contrata por medios electrónicos. Añadir precio, medios de reclamo, domicilio y condiciones específicas antes de activar compras.
- [ ] Preparar **avisos separados** para GAMMS MDM, dispositivos administrados y geolocalización; no basta la política de la web corporativa.
- [ ] Validar los requisitos para el registro y tratamiento de datos de personas menores de edad. Si quien ejerce la titularidad del proyecto fuera menor de edad, verificar además capacidad para contratar, comercio, representación legal y gestión de obligaciones con abogado/contador local antes de ofrecer productos de pago.
- [ ] Pedir revisión jurídica local. Quitar los avisos de información provisional y `noindex` **solo tras identificar al responsable real y completar** los textos.

## Secret ID: cláusulas operativas añadidas (1 de noviembre de 2026)

- [x] La política de privacidad explica que Secret ID es una función gratuita, opcional y en desarrollo, y que la web pública no exige una cuenta.
- [x] Los términos separan el inicio de sesión con Google del tratamiento propio de datos y no atribuyen a Google responsabilidad por la base de Secret ID.
- [x] Se describen la asociación del identificador Google con el perfil, la ausencia de contraseñas de Google en el servicio, el mantenimiento de sesiones y los correos para acceso o supresión.
- [x] Se aclara que cerrar sesión o desvincular la cuenta en Google no elimina automáticamente los datos guardados por Secret ID.
- [ ] **Estas cláusulas no eximen del deber de identificar al responsable real y su domicilio, respetar los requisitos de capacidad/representación de menores, atender derechos ni validar la base jurídica del tratamiento.** No presentar el texto como un permiso legal independiente para abrir registros a cualquier usuario.

## Consentimiento y scripts

- `/legal/cookie-consent.js` guarda `gamms-cookie-notice-v2` en localStorage como constancia de que el visitante cerró el aviso informativo. `window.GAMMSConsent.get()` indica que las cookies necesarias están habilitadas y que analítica y marketing no están en uso.
- No añade scripts de analítica ni marketing. Como no existen categorías opcionales activas, muestra «Entendido» y un panel explicativo, sin simular un consentimiento a rastreadores inexistentes.
- El script de autenticación de Google se solicita desde `home-v2.js` cuando el usuario abre el inicio de sesión, no en el `<head>` de la portada.
- **Importante:** antes de agregar scripts opcionales en el futuro, condicionar su carga a una decisión previa y evitar cookies antes del consentimiento. También documentar cómo se desactivan o eliminan las cookies que coloque el proveedor al retirar consentimiento. Guardar pruebas del consentimiento si una finalidad lo requiere.
- La cookie `GAMMS-ACCOUNT-SESSION` es necesaria exclusivamente cuando se inicia sesión; `HttpOnly; Secure; SameSite=Lax`, máximo 30 días según `functions/api/account/google.js`.

## Validación técnica mínima

1. Abrir en modo privado `/`, `/aviso-legal/`, `/privacidad/`, `/cookies/`, `/terminos/` y una página de producto: comprobar aviso inicial y enlaces.
2. Pulsar «Entendido»: debe ocultarse el aviso y recordarse el acuse tras recargar.
3. Usar «Información sobre cookies»: debe abrir un diálogo explicativo sin activar cookies nuevas y no modificar la sesión existente.
4. Recargar la página con accesibilidad/teclado: botones y casillas se pueden enfocar; Esc cierra el diálogo.
5. Verificar que en una visita inicial no se solicita `accounts.google.com/gsi/client` y que al pulsar inicio de sesión sí se carga.
6. Verificar en DevTools que las categorías opcionales **no** generan solicitudes de analítica o publicidad antes de consentir.
7. Confirmar que Cloudflare Pages Functions e integración Secret ID siguen funcionando y que las rutas HTML se entregan bien.
8. Ejecutar `npm test` y verificar los flujos con un navegador real en un despliegue de previsualización.

## Bases jurídicas consultadas

- Ley No. 787, Protección de Datos Personales: https://www.leybook.com/doc/11606
- Decreto 36-2012, Reglamento de la Ley 787: https://www.leybook.com/doc/7686
- Ley No. 842, texto consolidado de protección a personas consumidoras y usuarias: https://www.leybook.com/doc/30861

La Ley 787 contempla como responsable de fichero tanto a una **persona natural** como a una **persona jurídica** (art. 3) y exige informar identidad y domicilio del responsable antes de recopilar datos (art. 7); el hecho de no registrar una empresa no elimina estas obligaciones. Estas referencias son información para la revisión, **no** certificación de cumplimiento normativo.

## Diseño y coherencia visual

- La portada y las cuatro páginas legales usan `/assets/gamms-mark.svg`, un dibujo vectorial nuevo que reinterpreta la marca metálica existente. El archivo `assets/gamms-logo.webp` original permanece en el repositorio y puede recuperarse si se necesita identidad 1:1.
- Se mantienen los documentos accesibles a través del pie de página sin exponer nombre, documentos de identidad ni dirección residencial de la persona menor de edad que impulsa el proyecto.
