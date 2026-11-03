import {test} from 'node:test';import assert from 'node:assert/strict';import {renderEmail,renderHistory,buildPayload,sendEmail,runBatch} from '../supabase/functions/_shared/mail.mjs';
import {demoJob} from './demo.mjs';
import {demosActualizadas} from './demo-actualizado.mjs';
import {demosOficiales} from './demo-oficial.mjs';
test('official rental receipts accumulate 120000 plus 70000 against 190000 and identify the paid month',()=>{
 const [partial,complete]=demosOficiales.map(j=>renderEmail(j,j.datos.whatsapp));
 assert(partial.text.includes('Quedan $70.000 pendientes'));assert(partial.text.includes('Estado del mes: Pago parcial'));
 assert(complete.text.includes('por $70.000'));assert(complete.text.includes('La mensualidad de noviembre de 2026 está pagada.'));
 assert(complete.text.includes('Total pagado del mes: $190.000'));assert(complete.text.includes('Saldo de la cuota: $0'));assert(complete.text.includes('Estado del mes: Pagado'));
 for(const job of demosOficiales){const email=renderEmail(job,job.datos.whatsapp);assert(!/PRUEBA|MONTO DE EJEMPLO|Demostración/.test(email.subject+email.html+email.text));}
 for(const provider of ['brevo','resend'])for(const job of demosOficiales){const payload=buildPayload(job,{...config,provider});const brand=job.datos.tipo_contrato==='prestamo'?'Antonini Inversiones':'Antonini Casa PAC 4009';assert(payload.body.subject.startsWith(brand));assert.equal(provider==='brevo'?payload.body.sender.name:payload.body.from.split(' <')[0],brand);}
});
test('Subercaseaux uses the original simple receipt and a reminder without data tables; loan keeps its history',()=>{
 const [loanJob,rentJob,alertJob]=demosActualizadas;
 for(const audiencia of ['cliente','administrador']){
  const rent=renderEmail({...rentJob,audiencia});const alert=renderEmail({...alertJob,audiencia});const loan=renderEmail({...loanJob,audiencia});
  for(const email of [rent,alert]){
   assert(email.subject.startsWith('[PRUEBA] Antonini Casa PAC 4009 · '));
   assert(email.subject.includes('Habitación 01'));assert(email.html.includes('Casa PAC 4009 - Habitación 01'));
   assert(!email.html.includes('rent-history'));assert(!email.text.includes('últimos 6 meses'));assert(!email.html.includes('Historial de arriendo'));
   assert(!email.subject.includes('Subercaseaux'));assert(!email.html.includes('Subercaseaux'));assert(!email.text.includes('Subercaseaux'));
  }
  assert(rent.html.includes('Detalle del pago'));assert(rent.html.includes('scope="row"'));assert(rent.text.includes('Saldo de la cuota: $50.000'));
  assert(!alert.html.includes('<th'));assert(!alert.html.includes('<thead'));assert(!alert.html.includes('Detalle del vencimiento'));
  assert(alert.html.includes('MONTO PENDIENTE'));assert(alert.text.includes('Saldo pendiente: $170.000'));
  assert(loan.subject.startsWith('[PRUEBA] Antonini Inversiones · '));assert(loan.html.includes('class="loan-history"'));assert(loan.html.includes('<img'));
 }
});
test('approved collection wording includes month, room, outstanding amount and administrator contacts',()=>{
 const [loan,rent,alert]=demosActualizadas.map(j=>renderEmail(j,j.datos.whatsapp));
 assert(loan.text.includes('No hemos recibido su pago del mes de octubre de 2026 por $140.000'));
 assert(!loan.text.includes('por la Habitación'));
 assert(alert.text.includes('No hemos recibido su pago del mes de octubre de 2026 por $170.000 por la Habitación 01'));
 for(const e of [loan,alert]){assert(e.text.includes('correo tvxsiempre@gmail.com'));assert(e.text.includes('teléfono +56 9 6725 1612'));}
 assert(rent.text.includes('Hemos recibido su pago del mes de octubre de 2026 por $120.000 por la Habitación 01'));
 assert(rent.text.includes('Quedan $50.000 pendientes'));
 const partial=renderEmail({...demosActualizadas[1],tipo:'atraso_7_dias'});
 assert(partial.text.includes('Hemos recibido un abono de $120.000'));assert(!partial.text.includes('No hemos recibido'));
});
test('demo is personalized, clearly fictitious, and includes the payment table',()=>{const email=renderEmail(demoJob);assert(email.subject.startsWith('[PRUEBA]'));assert(email.text.includes('Hola, Gabriel Hidalgo.'));assert(email.text.includes('Hemos recibido su pago'));assert(email.text.includes('no registra un pago'));assert(email.html.includes('Detalle del pago'));assert(email.html.includes('scope="row"'));assert(email.text.includes('170.000'));const admin=renderEmail({...demoJob,audiencia:'administrador'});assert(admin.text.includes('el pago de Gabriel Hidalgo'));assert(!renderEmail(job).subject.includes('[PRUEBA]'));});
const job={id:'test-job',token_bloqueo:'lock',tipo:'pago_recibido',audiencia:'cliente',destinatario:'cliente@example.com',datos:{cliente:'Ana <script>',concepto:'Habitación 1',periodo:'2026-10',fecha:'2026-10-26',monto:50000,capital:50000,interes:0,saldo:120000,referencia:'pago1'}};
const config={provider:'brevo',apiKey:'fake-test-key',from:'admin@example.com',replyTo:'admin@example.com',whatsapp:'+56 9 6725 1612'};
test('loan receipts and alerts use their own brand in subject, sender and footer',()=>{
 for(const tipo of ['pago_recibido','atraso_7_dias'])for(const provider of ['brevo','resend'])for(const datos of [{...demosActualizadas[0].datos,habitacion:'Habitación 01'},{...job.datos,tipo_contrato:undefined,concepto:'Préstamo P-01'}]){
  const loan={...job,tipo,datos};const email=renderEmail(loan);const payload=buildPayload(loan,{...config,provider});
  assert(email.subject.includes('Antonini Inversiones'));assert(!email.subject.includes('Subercaseaux'));assert(!email.html.includes('Subercaseaux'));assert(!email.text.includes('Subercaseaux'));
  assert.equal(provider==='brevo'?payload.body.sender.name:payload.body.from.split(' <')[0],'Antonini Inversiones');
 }
 assert.equal(buildPayload(job,config).body.sender.name,'Antonini Casa PAC 4009');
});
test('rental receipts and overdue notices put the actual room in header and subject',()=>{for(const tipo of ['pago_recibido','atraso_7_dias']){const email=renderEmail({...job,tipo,datos:{...job.datos,tipo_contrato:'arriendo',habitacion:'Habitación 03'}});assert(email.html.includes('Casa PAC 4009 - Habitación 03'));assert(email.subject.includes('Antonini Casa PAC 4009'));assert(email.subject.includes('Habitación 03'));}});
test('history distinguishes pending and partial months without rental cumulative totals',()=>{const data={tipo_contrato:'arriendo',historial:[{periodo:'2026-09',mensualidad:170000,pagado:0,saldo:170000},{periodo:'2026-10',mensualidad:170000,pagado:120000,saldo:50000}]};const result=renderHistory(data);assert(result.text.includes('Pendiente'));assert(result.text.includes('Pago parcial'));assert(result.text.includes('120.000'));assert(result.text.includes('50.000'));assert(!result.text.includes('Total pagado'));});
test('loan uses supplied logo and leaves unpaid interest and capital contributions as dashes',()=>{const email=renderEmail({...job,datos:{...job.datos,tipo_contrato:'prestamo',saldo_capital:1200000,historial:[{periodo:'2026-10',capital_antes:1200000,pagado:0,capital:0,interes:0,saldo:140000}]}},'','https://example.com/logo.png');assert(email.html.includes('src="https://example.com/logo.png"'));assert(email.text.includes('— | — | —'));assert(email.text.includes('Saldo de capital pendiente'));assert(email.text.includes('Pendiente'));assert(!renderEmail(job).html.includes('<img'));});
test('receipt escapes names and does not say a partial payment settles the whole debt',()=>{const email=renderEmail(job);assert(email.html.includes('&lt;script&gt;'));assert(!email.html.includes('<script>'));assert(email.text.includes('Saldo de la cuota'));assert(!email.text.includes('deuda saldada'));});
test('seven-day reminder includes the requested WhatsApp instruction and link',()=>{const email=renderEmail({...job,tipo:'atraso_7_dias',datos:{...job.datos,dias_atraso:7,vencimiento:'2026-10-19'}},config.whatsapp);assert(email.text.includes('Si ya realizó el pago'));assert(email.html.includes('https://wa.me/56967251612'));});
test('Brevo payload uses a reply-to and only the current customer as recipient',async()=>{let sent;const id=await sendEmail(buildPayload(job,config),{provider:'brevo',apiKey:'test',fetchFn:async(url,opts)=>{sent={url,...opts};return Response.json({messageId:'brevo-123'});}});assert.equal(id,'brevo-123');const body=JSON.parse(sent.body);assert.equal(body.replyTo.email,'admin@example.com');assert.deepEqual(body.to,[{email:'cliente@example.com'}]);});
test('Resend retries preserve a unique event idempotency key',async()=>{let headers;const payload=buildPayload(job,{...config,provider:'resend'});await sendEmail(payload,{provider:'resend',apiKey:'test',fetchFn:async(_url,opts)=>{headers=opts.headers;return Response.json({id:'resend-123'});}});assert.equal(headers['Idempotency-Key'],'antonini/test-job');});
test('uncertain Brevo deliveries go to manual review rather than sending duplicates',async()=>{await assert.rejects(sendEmail(buildPayload(job,config),{provider:'brevo',apiKey:'test',fetchFn:async()=>{throw Error('timeout');}}),e=>e.permanent===true);});
test('rate limiting is retried but bad credentials require review',async()=>{for(const [status,permanent] of [[429,false],[401,true]])await assert.rejects(sendEmail(buildPayload(job,config),{provider:'brevo',apiKey:'test',fetchFn:async()=>new Response('',{status})}),e=>e.permanent===permanent);});
test('batch checks cancellation, freezes the payload and records acceptance',async()=>{const calls=[];const rpc=async(name,args)=>{calls.push([name,args]);if(name==='reclamar_correos')return [job];if(name==='validar_correo_envio')return true;if(name==='congelar_solicitud_correo')return args.p_solicitud;return true};const result=await runBatch({rpc,config,fetchFn:async()=>Response.json({messageId:'ok'}),pause:async()=>{}});assert.equal(result.accepted,1);assert(calls.some(([name])=>name==='confirmar_correo'));});
test('cancelled late-payment warning never contacts the provider',async()=>{let sent=false;const result=await runBatch({rpc:async name=>name==='reclamar_correos'?[job]:false,config,fetchFn:async()=>{sent=true},pause:async()=>{}});assert.equal(result.cancelled,1);assert.equal(sent,false);});
