function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function onRequestGet({ env }) {
  const clientId = env.GOOGLE_CLIENT_ID || '';
  return json({ configured: Boolean(clientId), clientId });
}
