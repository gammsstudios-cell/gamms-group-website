const COOKIE_NAME='GAMMS-ACCOUNT-SESSION';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function readCookie(request,name){const raw=request.headers.get('Cookie')||'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin}
async function auth(request,db){const token=readCookie(request,COOKIE_NAME);if(!token)return null;const hash=await sha256(token);return db.prepare(`SELECT id,account_id FROM site_account_sessions WHERE token_hash=?1 AND expires_at>datetime('now') LIMIT 1`).bind(hash).first()}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return json({error:'Cross-origin request rejected'},403);if(!env.ACCOUNTS_DB)return json({error:'Database unavailable'},503);const current=await auth(request,env.ACCOUNTS_DB);if(!current)return json({error:'Not authenticated'},401);let body={};try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 const action=String(body?.action||'');
 if(action==='signout_others'){
   const r=await env.ACCOUNTS_DB.prepare(`DELETE FROM site_account_sessions WHERE account_id=?1 AND id<>?2`).bind(current.account_id,current.id).run();
   await env.ACCOUNTS_DB.prepare(`INSERT INTO site_account_activity (id,account_id,event_type,summary) VALUES (?1,?2,'sessions_revoked','Other Secret ID sessions were signed out')`).bind(crypto.randomUUID(),current.account_id).run().catch(()=>{});
   return json({ok:true,revoked:r.meta?.changes||0});
 }
 if(action==='revoke'){
   const sessionId=typeof body?.sessionId==='string'?body.sessionId:'';if(!sessionId||sessionId===current.id)return json({error:'Current session cannot be revoked here'},400);
   const r=await env.ACCOUNTS_DB.prepare(`DELETE FROM site_account_sessions WHERE account_id=?1 AND id=?2`).bind(current.account_id,sessionId).run();
   return json({ok:true,revoked:r.meta?.changes||0});
 }
 return json({error:'Unsupported action'},400);
}
