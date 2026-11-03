import fs from 'node:fs/promises';
import {renderEmail} from '../supabase/functions/_shared/mail.mjs';
import {demoJob} from '../mail/demo.mjs';
const dir=new URL('../data/vista-correos/',import.meta.url);
await fs.mkdir(dir,{recursive:true});
const historial=[5,6,7,8,9,10].map(m=>({periodo:`2026-${String(m).padStart(2,'0')}`,mensualidad:170000,pagado:m===9?0:m===10?120000:170000,saldo:m===9?170000:m===10?50000:0}));
const rent={...demoJob,datos:{...demoJob.datos,tipo_contrato:'arriendo',habitacion:'Habitación 01',concepto:'Habitación 01',monto:120000,capital:120000,saldo:50000,historial,historial_desde:'2026-05',historial_hasta:'2026-10'}};
const loan={...demoJob,datos:{...demoJob.datos,tipo_contrato:'prestamo',cliente:'Daniel Teran',concepto:'Préstamo de ejemplo',monto:140000,capital:80000,interes:60000,saldo:0,capital_inicial:1200000,tasa_mensual:5,saldo_capital:1120000,
  historial:historial.map(r=>({...r,mensualidad:140000,capital_antes:1200000,capital:r.periodo==='2026-10'?80000:0,interes:r.periodo==='2026-10'?60000:0,pagado:r.periodo==='2026-10'?140000:0,saldo:r.periodo==='2026-10'?0:140000,fecha:r.periodo==='2026-10'?'2026-10-26':null})),historial_desde:'2026-05',historial_hasta:'2026-10'}};
for(const [name,job] of [['arriendo',rent],['atraso',{...rent,tipo:'atraso_7_dias',datos:{...rent.datos,vencimiento:'2026-10-19',dias_atraso:7}}],['prestamo',loan]])await fs.writeFile(new URL(name+'.html',dir),renderEmail(job,job.datos.whatsapp).html);
console.log('Vistas de arriendo, atraso y préstamo preparadas, sin enviar correos.');
