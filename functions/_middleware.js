// Cloudflare Pages: legal UI on HTML routes and Secret ID assets on the homepage.
// The homepage and the four legal pages already load their consent assets explicitly.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const isHome = url.pathname === '/' || url.pathname === '/index.html';
  const isLegalPage = /^\/(?:aviso-legal|privacidad|cookies|terminos)(?:\/|\/index\.html)?$/.test(url.pathname);
  if (isLegalPage) return response;

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        if (isHome) {
          element.append('<link rel="stylesheet" href="/secret-id-platform.css">', { html: true });
        } else {
          element.append('<link rel="stylesheet" href="/legal/cookie-consent.css">', { html: true });
        }
      },
    })
    .on('body', {
      element(element) {
        if (isHome) {
          element.append('<script src="/secret-id-platform-core.js"></script><script src="/secret-id-platform-account.js"></script><script src="/secret-id-platform-command.js"></script>', { html: true });
        } else {
          element.append('<script src="/legal/cookie-consent.js" defer></script>', { html: true });
        }
      },
    })
    .transform(response);
}
