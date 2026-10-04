const COOKIE_NAME='GAMMS-ACCOUNT-SESSION';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function readCookie(request,name){const raw=request.headers.get('Cookie')||'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin}
async function accountId(request,db){const t=readCookie(request,COOKIE_NAME);if(!t)return null;const h=await sha256(t);const r=await db.prepare(`SELECT account_id FROM site_account_sessions WHERE token_hash=?1 AND expires_at>datetime('now') LIMIT 1`).bind(h).first();return r?.account_id||null}
function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return 'sid_'+[...a].map(v=>v.toString(16).padStart(2,'0')).join('')}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return json({error:'Cross-origin request rejected'},403);if(!env.ACCOUNTS_DB)return json({error:'Database unavailable'},503);const account=await accountId(request,env.ACCOUNTS_DB);if(!account)return json({error:'Not authenticated'},401);let body={};try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 try{
  if(body?.action==='create'){
   const name=typeof body?.name==='string'?body.name.trim().slice(0,80):'';if(name.length<2)return json({error:'Token name is too short'},400);const token=randomToken(),hash=await sha256(token),id=crypto.randomUUID(),scopes='profile:read';
   await env.ACCOUNTS_DB.prepare(`INSERT INTO site_account_api_tokens (id,account_id,name,token_hash,scopes) VALUES (?1,?2,?3,?4,?5)`).bind(id,account,name,hash,scopes).run();
   await env.ACCOUNTS_DB.prepare(`INSERT INTO site_account_activity (id,account_id,event_type,summary,metadata_json) VALUES (?1,?2,'api_token_created','Developer API token created',?3)`).bind(crypto.randomUUID(),account,JSON.stringify({tokenId:id,name,scopes})).run().catch(()=>{});
   return json({ok:true,token:{id,name,scopes,value:token}})
  }
  if(body?.action==='revoke'&&typeof body?.id==='string'){
   await env.ACCOUNTS_DB.prepare(`UPDATE site_account_api_tokens SET revoked_at=datetime('now') WHERE id=?1 AND account_id=?2`).bind(body.id,account).run();return json({ok:true})
  }
 }catch(error){console.error(error);return json({error:'Developer tokens unavailable until the latest account migration is applied'},503)}
 return json({error:'Unsupported action'},400)}
