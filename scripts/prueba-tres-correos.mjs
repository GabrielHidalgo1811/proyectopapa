import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {demosActualizadas} from '../mail/demo-actualizado.mjs';
import {demosOficiales} from '../mail/demo-oficial.mjs';
import {buildPayload,renderEmail,sendEmail} from '../supabase/functions/_shared/mail.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const batch=process.argv.find(arg=>arg.startsWith('--batch='))?.slice(8);
if(batch && !/^[a-z0-9-]{1,60}$/.test(batch))throw Error('Identificador de prueba inválido.');
if(process.argv.includes('--official') && !batch)throw Error('Indica --batch para identificar estas nuevas vistas.');
const jobs=(process.argv.includes('--official')?demosOficiales:demosActualizadas).map(job=>batch?{...job,id:batch+'-'+job.id}:job);
const directory=path.join(root,'data',batch?'pruebas-'+batch:'pruebas-textos-v3');
await fs.mkdir(directory,{recursive:true});
for(const job of jobs)await fs.writeFile(path.join(directory,job.id+'.html'),renderEmail(job,job.datos.whatsapp).html);
console.log(jobs.length+' vistas preparadas, sin registrar datos en la base de datos.');
if(process.argv.includes('--send')){
  process.loadEnvFile(path.join(root,'supabase','.env.local'));
  const config={provider:'brevo',apiKey:process.env.BREVO_API_KEY,from:process.env.MAIL_FROM,replyTo:process.env.MAIL_REPLY_TO,whatsapp:process.env.MAIL_WHATSAPP};
  if(!config.apiKey||!config.from||!config.replyTo)throw Error('Falta configurar Brevo.');
  // Verifica el acceso de red antes de marcar intentos de envío.
  await fetch('https://api.brevo.com',{signal:AbortSignal.timeout(10000)});
  for(const job of jobs){
    const log=path.join(directory,job.id+'-envio.json');
    await fs.writeFile(log,JSON.stringify({estado:'iniciado',destinatario:job.destinatario,fecha:new Date().toISOString()}),{flag:'wx'});
    try{
      const id=await sendEmail(buildPayload(job,config),config);
      await fs.writeFile(log,JSON.stringify({estado:'aceptado_por_brevo',id,destinatario:job.destinatario,fecha:new Date().toISOString()},null,2));
      console.log(job.id+': aceptado por Brevo.');
    }catch(error){
      await fs.writeFile(log,JSON.stringify({estado:'revisar_antes_de_reintentar',error:error.message},null,2));
      throw error;
    }
    await new Promise(r=>setTimeout(r,650));
  }
}
