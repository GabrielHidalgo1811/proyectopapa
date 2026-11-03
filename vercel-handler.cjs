const {hkdfSync}=require('node:crypto');
const {createServer}=require('./server.cjs');
const {createAuth}=require('./database/auth.cjs');
const {createSupabaseSessionStore}=require('./database/session-store.cjs');
const {openSupabaseStore}=require('./database/supabase-store.cjs');
function createVercelHandler({env=process.env,fetchFn=fetch,sessionStore}={}){
 const url=env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/,'');
 const publishableKey=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),key=env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!publishableKey||!key)throw Error('Faltan las variables de Supabase en Vercel.');
 if(env.ANTONINI_STORAGE&&env.ANTONINI_STORAGE!=='supabase')throw Error('ANTONINI_STORAGE debe ser supabase en Vercel.');
 const origins=[...new Set(['https://proyectopapa.vercel.app',env.VERCEL_URL&&'https://'+env.VERCEL_URL,env.VERCEL_PROJECT_PRODUCTION_URL&&'https://'+env.VERCEL_PROJECT_PRODUCTION_URL,env.APP_URL].filter(Boolean).map(value=>new URL(value).origin))];
 if(origins.some(origin=>!origin.startsWith('https://')))throw Error('El dominio de producción debe usar HTTPS.');
 // Derivacion estable entre funciones e instancias; no se escribe una clave en disco.
 const secretKey=Buffer.from(hkdfSync('sha256',Buffer.from(key),Buffer.from(url),Buffer.from('antonini-sessions-v1'),32));
 const auth=createAuth({url,publishableKey,serviceKey:key,fetchFn,sessionStore:sessionStore||createSupabaseSessionStore({url,key,fetchFn}),secretKey,getOrigin:req=>'https://'+req.headers.host,mail:{apiKey:env.BREVO_API_KEY,from:env.MAIL_FROM,replyTo:env.MAIL_REPLY_TO}});
 const store=openSupabaseStore({url,key,fetchFn});
 return createServer(store,{auth,storage:'supabase',origins}).listeners('request')[0];
}
let cached;
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{if(!cached)cached=createVercelHandler();await cached(req,res)}catch(error){
  if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'No se pudo iniciar el acceso seguro. Revisa las variables de Vercel y aplica el SQL 09 de sesiones.'}))}
 }
}
module.exports={createVercelHandler,handler};
