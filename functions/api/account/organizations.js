const COOKIE_NAME='GAMMS-ACCOUNT-SESSION';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function readCookie(request,name){const raw=request.headers.get('Cookie')||'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin}
async function accountId(request,db){const t=readCookie(request,COOKIE_NAME);if(!t)return null;const h=await sha256(t);const r=await db.prepare(`SELECT account_id FROM site_account_sessions WHERE token_hash=?1 AND expires_at>datetime('now') LIMIT 1`).bind(h).first();return r?.account_id||null}
function slugify(value){return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'organization'}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return json({error:'Cross-origin request rejected'},403);if(!env.ACCOUNTS_DB)return json({error:'Database unavailable'},503);const account=await accountId(request,env.ACCOUNTS_DB);if(!account)return json({error:'Not authenticated'},401);let body={};try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 const name=typeof body?.name==='string'?body.name.trim().replace(/\s+/g,' ').slice(0,80):'';if(name.length<2)return json({error:'Organization name is too short'},400);
 const id=crypto.randomUUID();let slug=slugify(name);for(let i=0;i<4;i++){const found=await env.ACCOUNTS_DB.prepare(`SELECT id FROM site_organizations WHERE slug=?1 LIMIT 1`).bind(slug).first().catch(()=>null);if(!found)break;slug=`${slugify(name).slice(0,40)}-${crypto.randomUUID().slice(0,6)}`}
 try{
  await env.ACCOUNTS_DB.prepare(`INSERT INTO site_organizations (id,name,slug,created_by_account_id) VALUES (?1,?2,?3,?4)`).bind(id,name,slug,account).run();
  await env.ACCOUNTS_DB.prepare(`INSERT INTO site_organization_members (organization_id,account_id,role) VALUES (?1,?2,'owner')`).bind(id,account).run();
  await env.ACCOUNTS_DB.prepare(`INSERT INTO site_account_activity (id,account_id,event_type,summary,metadata_json) VALUES (?1,?2,'organization_created','Organization created',?3)`).bind(crypto.randomUUID(),account,JSON.stringify({organizationId:id,name,slug,role:'owner'})).run().catch(()=>{});
  await env.ACCOUNTS_DB.prepare(`INSERT INTO site_account_notifications (id,account_id,notification_type,title,body) VALUES (?1,?2,'success','Organization created',?3)`).bind(crypto.randomUUID(),account,`${name} is now linked to your Secret ID.`).run().catch(()=>{});
 }catch(error){console.error(error);return json({error:'Organizations unavailable until the latest account migration is applied'},503)}
 return json({ok:true,organization:{id,name,slug,role:'owner'}})}
