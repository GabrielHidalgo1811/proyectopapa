const {createLocalSessionStore}=require('./session-store.cjs');
const {readJsonBody}=require('./request.cjs');
const {randomBytes,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');
const SIX_HOURS=6*60*60*1000,THIRTY_DAYS=30*24*60*60*1000;
class AuthError extends Error {constructor(message,status=400){super(message);this.status=status}}
function createAuth({url,publishableKey,serviceKey,filename,mail={},fetchFn=fetch,now=Date.now,secretKey,sessionStore,getOrigin=req=>`${req.socket.encrypted?'https':'http'}://${req.headers.host}`}={}){
 if(!url||!publishableKey||!serviceKey)throw Error('Configura Supabase para habilitar el inicio de sesión.');
 url=url.replace(/\/$/,'');
 if(!sessionStore&&filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 let key=secretKey;
 if(!key){if(sessionStore)throw Error('Configura la clave de cifrado de sesiones.');const keyFile=filename+'.key';try{key=fs.readFileSync(keyFile)}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);fs.writeFileSync(keyFile,key,{flag:'wx',mode:0o600})}}
 if(key.length!==32)throw Error('Clave de sesiones inválida.');
 const store=sessionStore||createLocalSessionStore(filename);
 const locks=new Map(),rates=new Map();
 const digest=s=>createHash('sha256').update(s).digest('hex');
 const seal=t=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const b=Buffer.concat([c.update(JSON.stringify(t),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64')};
 const unseal=s=>{const b=Buffer.from(s,'base64'),c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8'))};
 function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
 function cookie(req,res,sid,remember=false,purpose='app'){const value=`${purpose==='recovery'?'antonini_recovery':'antonini_session'}=${sid}; HttpOnly; SameSite=Strict; Path=/${getOrigin(req).startsWith('https://')?'; Secure':''}${!sid?'; Max-Age=0':remember?'; Max-Age='+THIRTY_DAYS/1000:''}`;const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',previous?[...(Array.isArray(previous)?previous:[previous]),value]:value)}
 function sessionId(req,purpose='app'){const prefix=(purpose==='recovery'?'antonini_recovery':'antonini_session')+'=';const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(prefix))?.slice(prefix.length);return raw&&/^[a-f0-9]{64}$/.test(raw)?digest(raw):''}
 async function api(route,body,token,method='POST',admin=false){
  let r;try{r=await fetchFn(url+route,{method,headers:{apikey:admin?serviceKey:publishableKey,Authorization:`Bearer ${token||(admin?serviceKey:publishableKey)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})}catch{throw new AuthError('No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.',503)}
  if(!r.ok)throw new AuthError('Correo o contraseña incorrectos, o acceso no autorizado.',r.status>=500?503:401);
  if(r.status===204)return {};return r.json();
 }
 async function adminUser(user){if(!user?.id||!user.email)return false;const rows=await api('/rest/v1/administradores?select=usuario_id&usuario_id=eq.'+encodeURIComponent(user.id),null,null,'GET',true);return Array.isArray(rows)&&rows.some(r=>r.usuario_id===user.id)}
 async function issue(req,res,t,user,remember,purpose='app'){
  const old=sessionId(req,purpose);if(old)await store.delete(old);
  await store.prune(now());
  const sid=randomBytes(32).toString('hex'),expires=now()+(purpose==='recovery'?15*60*1000:remember?THIRTY_DAYS:SIX_HOURS);
  await store.insert({id:digest(sid),user_id:user.id,email:user.email,tokens:seal({access_token:t.access_token,refresh_token:t.refresh_token}),token_expires:now()+(t.expires_in||3600)*1000,expires,remember:remember?1:0,purpose});
  cookie(req,res,sid,remember&&purpose==='app',purpose);return {user:{id:user.id,email:user.email},expiresAt:expires,remember};
 }
 async function session(req,purpose='app'){
  const id=sessionId(req,purpose);if(!id)return null;let row=await store.get(id);
  if(!row||row.expires<=now()||row.purpose!==purpose){if(row?.expires<=now())await store.delete(id);return null}
  if(row.token_expires<=now()+60000){
   if(!locks.has(id))locks.set(id,(async()=>{
    const fresh=await store.get(id);if(!fresh||fresh.expires<=now())return;
    let ticket;
    if(store.claimRefresh){
     ticket=await store.claimRefresh(id);
     if(!ticket){
      for(let i=0;i<20;i++){
       await new Promise(r=>setTimeout(r,150));const other=await store.get(id);
       if(!other||other.expires<=now())return;
       if(other.token_expires>now()+60000)return;
      }
      throw new AuthError('La sesión se está renovando. Intenta nuevamente.',503);
     }
    }
    try{
     const t=await api('/auth/v1/token?grant_type=refresh_token',{refresh_token:unseal(fresh.tokens).refresh_token});
     if(t.user?.id!==fresh.user_id)throw new AuthError('La sesión no es válida.',401);
     await store.update(id,seal(t),now()+(t.expires_in||3600)*1000,ticket);
    }finally{if(ticket)await store.releaseRefresh(id,ticket).catch(()=>{})}
   })().finally(()=>locks.delete(id)));
   try{await locks.get(id)}catch(e){if(e.status===401)await store.delete(id);throw e}
   row=await store.get(id);if(!row||row.expires<=now())return null;
  }
  const tokens=unseal(row.tokens);
  let user;try{user=await api('/auth/v1/user',null,tokens.access_token,'GET')}catch(e){if(e.status===401){await store.delete(id);return null}throw e}
  if(user.id!==row.user_id||!await adminUser(user)){await store.delete(id);return null}
  return {...row,...tokens,user:{id:user.id,email:user.email}};
 }
 async function body(req){if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AuthError('Se requiere JSON.',415);try{const data=await readJsonBody(req,12000);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data}catch(e){throw new AuthError(e.message||'Solicitud inválida.',e.status||400)}}
 async function rate(req){if(store.rate){if(!await store.rate(digest(req.socket.remoteAddress||'unknown')))throw new AuthError('Demasiados intentos. Espera 15 minutos antes de volver a intentar.',429);return}const id=req.socket.remoteAddress;const cutoff=now()-15*60*1000;for(const [k,v] of rates)if(v[0]<cutoff)rates.delete(k);const list=(rates.get(id)||[]).filter(t=>t>=cutoff);if(list.length>=12)throw new AuthError('Demasiados intentos. Espera 15 minutos antes de volver a intentar.',429);list.push(now());rates.set(id,list)}
 async function handle(req,res,pathname){if(!pathname.startsWith('/api/auth/'))return false;
  try{
   if(pathname==='/api/auth/session'&&req.method==='GET'){const s=await session(req);if(!s){cookie(req,res,'');reply(res,401,{error:'Inicia sesión para continuar.'})}else reply(res,200,{user:s.user,expiresAt:s.expires,remember:Boolean(s.remember)});return true}
   if(req.method!=='POST')throw new AuthError('Método no permitido.',405);
   const data=await body(req);
   if(pathname==='/api/auth/logout'){for(const purpose of ['app','recovery']){const id=sessionId(req,purpose);if(id)await store.delete(id);cookie(req,res,'',false,purpose)}reply(res,200,{ok:true});return true}
   if(pathname==='/api/auth/login'){
    await rate(req);if(typeof data.email!=='string'||typeof data.password!=='string'||data.password.length>512)throw new AuthError('Ingresa tu correo y contraseña.');
    const t=await api('/auth/v1/token?grant_type=password',{email:data.email.trim(),password:data.password});
    if(!t.access_token||!t.refresh_token||!await adminUser(t.user))throw new AuthError('Correo o contraseña incorrectos, o acceso no autorizado.',401);
    reply(res,200,await issue(req,res,t,t.user,data.remember===true));return true;
   }
   if(pathname==='/api/auth/recover'){
    await rate(req);if(typeof data.email!=='string'||!/^\S+@\S+\.\S+$/.test(data.email.trim()))throw new AuthError('Ingresa un correo válido.');
    const origin=getOrigin(req);
    let link;
    try{link=await api('/auth/v1/admin/generate_link',{type:'recovery',email:data.email.trim()},null,'POST',true)}catch(e){if(e.status!==401)throw e}
    if(link?.hashed_token&&await adminUser(link.user)){
     if(!mail.apiKey||!mail.from)throw new AuthError('La recuperación por correo todavía no está configurada.',503);
     const reset=origin+'/?type=recovery&token_hash='+encodeURIComponent(link.hashed_token);
     const r=await fetchFn('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':mail.apiKey},body:JSON.stringify({sender:{name:'Antonini · Acceso seguro',email:mail.from},to:[{email:link.user.email}],replyTo:{email:mail.replyTo||mail.from},subject:'Restablecer tu contraseña · Antonini',htmlContent:`<html lang="es"><body style="font-family:Arial;color:#203a32"><h1>Restablecer contraseña</h1><p>Recibimos una solicitud para cambiar tu contraseña de Antonini.</p><p><a href="${reset}" style="background:#23745b;color:white;padding:14px 20px;display:inline-block">Crear nueva contraseña</a></p><p>El enlace es personal y solo puede utilizarse una vez. Si no hiciste esta solicitud, puedes ignorar este correo.</p></body></html>`,textContent:`Para restablecer tu contraseña abre: ${reset}\nSi no hiciste esta solicitud, ignora el correo.`}),signal:AbortSignal.timeout(15000)});
     if(!r.ok)throw new AuthError('No se pudo enviar el enlace. Inténtalo más tarde.',503);
    }
    reply(res,200,{message:'Si el correo tiene acceso autorizado, recibirá un enlace para restablecer su contraseña.'});return true;
   }
   if(pathname==='/api/auth/recovery'){
    await rate(req);if(typeof data.token_hash!=='string'||data.token_hash.length>512)throw new AuthError('El enlace no es válido.');
    const t=await api('/auth/v1/verify',{type:'recovery',token_hash:data.token_hash});
    if(!t.access_token||!t.refresh_token||!await adminUser(t.user))throw new AuthError('El enlace no es válido o ya venció.',401);
    await issue(req,res,t,t.user,false,'recovery');reply(res,200,{ok:true});return true;
   }
   if(pathname==='/api/auth/password'){
    const s=await session(req,'recovery');if(!s)throw new AuthError('El enlace venció. Solicita uno nuevo.',401);
    if(typeof data.password!=='string'||data.password.length<10||data.password.length>128)throw new AuthError('Usa entre 10 y 128 caracteres.');
    await api('/auth/v1/user',{password:data.password},s.access_token,'PUT');
    await store.deleteUser(s.user_id);cookie(req,res,'');cookie(req,res,'',false,'recovery');reply(res,200,{ok:true});return true;
   }
   throw new AuthError('No encontrado.',404);
  }catch(e){reply(res,e.status||503,{error:e instanceof AuthError?e.message:'No se pudo completar la operación. Inténtalo nuevamente.'});return true}
 }
 return {handle,authorize:req=>session(req),close:()=>store.close()};
}
module.exports={createAuth,SIX_HOURS,THIRTY_DAYS};
