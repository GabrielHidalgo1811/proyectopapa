import { runBatch } from '../_shared/mail.mjs';

Deno.serve(async request => {
  if(request.method!=='POST')return new Response('Método no permitido',{status:405});
  const secret=Deno.env.get('MAIL_WORKER_SECRET');
  if(!secret||request.headers.get('x-worker-secret')!==secret)return new Response('No autorizado',{status:401});
  const provider=Deno.env.get('MAIL_PROVIDER')||'brevo';
  const config={provider,apiKey:Deno.env.get(provider==='brevo'?'BREVO_API_KEY':'RESEND_API_KEY'),from:Deno.env.get('MAIL_FROM'),replyTo:Deno.env.get('MAIL_REPLY_TO'),whatsapp:Deno.env.get('MAIL_WHATSAPP')||''};
  const url=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!['brevo','resend'].includes(provider)||!config.apiKey||!config.from||!config.replyTo||!url||!key)return new Response('Configuración de correo incompleta',{status:503});
  async function rpc(name,body) {
    const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Base de datos: HTTP ${response.status}`);
    return await response.json();
  }
  try{return Response.json(await runBatch({rpc,config}));}
  catch{return new Response('No se completó el procesamiento; revisar registros de la cola.',{status:500});}
});
