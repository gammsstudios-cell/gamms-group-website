import { resolveCustomerIdentityToken } from "../../_lib/customerIdentity.js";

function noStoreHeaders(extra = {}) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

function redirectToPortal(cookie) {
  const headers = noStoreHeaders({ Location: "/aep/cliente" });
  headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function renderSwitchConfirmation(result) {
  const headers = noStoreHeaders({ "content-type": "text/html; charset=utf-8" });
  const current = result.currentCustomer;
  const target = result.targetCustomer;
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar cuenta GAMMS AEP</title><style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07110e;color:#f7fff9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:20px}
    main{max-width:420px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:24px;padding:24px;box-shadow:0 22px 60px rgba(0,0,0,.35)}
    h1{font-size:22px;margin:0 0 12px}.muted{color:rgba(255,255,255,.72);line-height:1.45}.accounts{display:grid;gap:10px;margin:18px 0}
    .account{padding:14px;border-radius:16px;background:rgba(255,255,255,.08)}button,a{display:inline-flex;justify-content:center;align-items:center;border-radius:14px;padding:12px 16px;font-weight:800;text-decoration:none}
    button{border:0;background:#20d69b;color:#04110c}a{color:#fff;border:1px solid rgba(255,255,255,.22)}form{display:flex;gap:10px;flex-wrap:wrap}
  </style></head><body><main><h1>Cambiar cuenta de cliente</h1><p class="muted">Este dispositivo ya esta vinculado a otra cuenta. Confirma si quieres usar la cuenta escaneada.</p><div class="accounts"><div class="account">Actual<br><strong>${escapeHtml(current.displayName || current.customerLabel)} · ${escapeHtml(current.customerLabel)}</strong></div><div class="account">Nueva<br><strong>${escapeHtml(target.displayName || target.customerLabel)} · ${escapeHtml(target.customerLabel)}</strong></div></div><form method="post"><a href="/aep/cliente">Cancelar</a><button type="submit">Usar esta cuenta</button></form></main></body></html>`, { status: 409, headers });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function recover({ request, env, params }, confirmSwitch = false) {
  const result = await resolveCustomerIdentityToken(env.DB, params.token, request, { confirmSwitch });
  if (!result.ok) {
    if (result.code === "IDENTITY_SWITCH_CONFIRMATION_REQUIRED") return renderSwitchConfirmation(result);
    return new Response("QR de cliente invalido o vencido.", { status: 404, headers: noStoreHeaders({ "content-type": "text/plain; charset=utf-8" }) });
  }
  return redirectToPortal(result.cookie);
}

export async function onRequestGet(context) {
  return recover(context, false);
}

export async function onRequestPost(context) {
  return recover(context, true);
}
