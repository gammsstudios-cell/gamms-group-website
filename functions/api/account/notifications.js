const COOKIE_NAME='GAMMS-ACCOUNT-SESSION';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function readCookie(request,name){const raw=request.headers.get('Cookie')||'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin}
async function accountId(request,db){const t=readCookie(request,COOKIE_NAME);if(!t)return null;const h=await sha256(t);const r=await db.prepare(`SELECT account_id FROM site_account_sessions WHERE token_hash=?1 AND expires_at>datetime('now') LIMIT 1`).bind(h).first();return r?.account_id||null}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return json({error:'Cross-origin request rejected'},403);if(!env.ACCOUNTS_DB)return json({error:'Database unavailable'},503);const id=await accountId(request,env.ACCOUNTS_DB);if(!id)return json({error:'Not authenticated'},401);let body={};try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 try{
  if(body?.action==='read_all'){await env.ACCOUNTS_DB.prepare(`UPDATE site_account_notifications SET read_at=datetime('now') WHERE account_id=?1 AND read_at IS NULL`).bind(id).run();return json({ok:true})}
  if(body?.action==='read'&&typeof body?.id==='string'){await env.ACCOUNTS_DB.prepare(`UPDATE site_account_notifications SET read_at=datetime('now') WHERE account_id=?1 AND id=?2`).bind(id,body.id).run();return json({ok:true})}
 }catch{return json({error:'Notifications unavailable until the latest account migration is applied'},503)}
 return json({error:'Unsupported action'},400)}
