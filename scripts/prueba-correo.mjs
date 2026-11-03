import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {demoJob} from '../mail/demo.mjs';
import {renderEmail,buildPayload,sendEmail} from '../supabase/functions/_shared/mail.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'data','prueba-correo-gabriel');
await fs.mkdir(directory,{recursive:true});
const jobs=[demoJob,{...demoJob,id:demoJob.id+'-admin',audiencia:'administrador',destinatario:'tvxsiempre@gmail.com'}];
for(const job of jobs) await fs.writeFile(path.join(directory,job.audiencia+'.html'),renderEmail(job,job.datos.whatsapp).html);
console.log('Diseños preparados en data/prueba-correo-gabriel. Datos ficticios, sin modificar la base de datos.');
if(process.argv.includes('--send')) {
  const source=await fs.readFile(path.join(root,'supabase','.env.local'),'utf8');
  const env=Object.fromEntries(source.split(/\r?\n/).filter(line=>line && !line.startsWith('#')).map(line=>{const p=line.indexOf('=');return [line.slice(0,p),line.slice(p+1).trim().replace(/^(["'])(.*)\1$/,'$2')];}));
  if(env.MAIL_PROVIDER!=='brevo' || !env.BREVO_API_KEY || !env.MAIL_FROM)throw Error('Falta la configuración de Brevo.');
  const config={provider:'brevo',apiKey:env.BREVO_API_KEY,from:env.MAIL_FROM,replyTo:env.MAIL_REPLY_TO||env.MAIL_FROM,whatsapp:env.MAIL_WHATSAPP};
  for(const job of jobs) {
    const log=path.join(directory,job.audiencia+'-envio.json');
    // Exclusión antes del envío: si el resultado es incierto no se repite automáticamente.
    await fs.writeFile(log,JSON.stringify({estado:'iniciado',destinatario:job.destinatario,fecha:new Date().toISOString()}),{flag:'wx'});
    try {
      const id=await sendEmail(buildPayload(job,config),config);
      await fs.writeFile(log,JSON.stringify({estado:'aceptado_por_brevo',id,destinatario:job.destinatario,fecha:new Date().toISOString()},null,2));
      console.log(job.audiencia+': aceptado por Brevo. Revisar bandeja de entrada y spam.');
    } catch(error) {
      await fs.writeFile(log,JSON.stringify({estado:'revisar_antes_de_reintentar',error:error.message},null,2));
      throw error;
    }
  }
}
