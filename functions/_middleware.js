export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (url.pathname !== '/' && url.pathname !== '/index.html') return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append('<link rel="stylesheet" href="/secret-id-platform.css">', { html: true });
      },
    })
    .on('body', {
      element(element) {
        element.append('<script src="/secret-id-platform-core.js"></script><script src="/secret-id-platform-account.js"></script><script src="/secret-id-platform-command.js"></script>', { html: true });
      },
    })
    .transform(response);
}
