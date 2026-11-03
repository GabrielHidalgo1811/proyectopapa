// Generado por scripts/build-email-editor.cjs.
// Copiar todo en index.ts de la funcion EXISTENTE hyper-handler (editor de Supabase).
// Las claves se leen de Secrets; no pegar claves en este codigo.

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value || 0));
const DEFAULT_LOAN_LOGO = 'https://vgpsbveqoibblijyawrn.supabase.co/storage/v1/object/public/correos/antonini-prestamos.png';
const monthLabel = value => /^\d{4}-\d{2}$/.test(value||'') ? new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')) : String(value||'');
const paymentState = row => Number(row.pagado||0) === 0 ? 'Pendiente' : Number(row.saldo)>0 ? 'Pago parcial' : 'Pagado';
const isLoan = d => d.tipo_contrato==='prestamo' || (d.tipo_contrato!=='arriendo' && (Boolean(d.prestamo_id) || /^Pr[eé]stamo\b/i.test(d.concepto||'')));
const serviceBrand = d => isLoan(d) ? 'Antonini Inversiones' : 'Antonini Casa PAC 4009';

function renderHistory(d) {
  if(!Array.isArray(d.historial)||!d.historial.length)return {html:'',text:''};
  const loan=isLoan(d);
  const headers=loan?['Período / fecha de pago','Capital¹','Intereses pagados','Abono a capital','Pago recibido','Saldo de cuota','Estado']:['Mes','Mensualidad','Pagado','Saldo','Estado'];
  const rows=d.historial.map(r=>{
    const paid=Number(r.pagado)>0;
    return {state:paymentState(r),cells:loan
      ? [monthLabel(r.periodo)+(r.fecha?' / '+r.fecha:''),r.capital_antes==null?'—':money(r.capital_antes),paid?money(r.interes):'—',paid?money(r.capital):'—',paid?money(r.pagado):'—',money(r.saldo),paymentState(r)]
      : [monthLabel(r.periodo),money(r.mensualidad),paid?money(r.pagado):'—',money(r.saldo),paymentState(r)]};
  });
  const title=loan?'Estado de cuenta · últimos 6 meses':'Historial de arriendo · últimos 6 meses';
  const range=d.historial_desde&&d.historial_hasta?`${monthLabel(d.historial_desde)} — ${monthLabel(d.historial_hasta)}`:'';
  const html=`<h2 style="font-size:17px;margin:28px 0 8px">${title}</h2><p style="font-size:12px;color:#64766b">${escape(range)} · Solo períodos registrados.</p><table class="${loan?'loan-history':'rent-history'}" width="100%" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;font-size:${loan?'10':'12'}px"><thead><tr>${headers.map(h=>`<th scope="col" style="background:#174f40;color:white;padding:9px 3px;overflow-wrap:anywhere">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr style="background:${r.state==='Pagado'?'#f3f8f2':'#fff4dc'}">${r.cells.map((cell,index)=>`<td style="padding:10px 3px;border-bottom:1px solid #dce5dc;overflow-wrap:anywhere;text-align:center">${loan?`<span class="history-label" style="display:none">${escape(headers[index])}</span>`:''}${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${loan?`<p style="font-size:11px;color:#64766b">Capital al inicio de cada período. Los importes pagados pueden incluir varios abonos; se muestra la última fecha de recepción.</p>`:''}`;
  return {html,text:[title,range,headers.join(' | '),...rows.map(r=>r.cells.join(' | '))].filter(Boolean).join('\n')};
}

// Replace only this renderer when the client's final design arrives.
function renderEmail(job, whatsapp = '', logoUrl = DEFAULT_LOAN_LOGO, adminEmail = '') {
  const d = job.datos;
  const receipt = job.tipo === 'pago_recibido';
  const loan = isLoan(d);
  const brand = serviceBrand(d);
  const concept = d.concepto;
  const room = loan ? '' : d.habitacion || (d.tipo_contrato==='arriendo' || /^(Habitaci[oó]n|Anexo)\b/i.test(d.concepto||'') ? d.concepto : '');
  const location = room ? `Casa PAC 4009 - ${room}` : loan ? 'Administración de préstamos' : 'Casa PAC 4009 · Administración de pagos';
  const title = receipt ? Number(d.saldo)>0 ? 'Abono registrado' : 'Pago actualizado' : 'Recordatorio de pago';
  const greeting = job.audiencia === 'administrador' ? `Administración: información de ${d.cliente}.` : loan ? `Estimado ${d.cliente}:` : `Hola, ${d.cliente}.`;
  const contactEmail=d.correo_administracion || adminEmail;
  const contact=[contactEmail?'correo '+contactEmail:'',whatsapp?'teléfono '+whatsapp:''].filter(Boolean).join(', ');
  const period=monthLabel(d.periodo);
  const installment=d.historial?.find(r=>r.periodo===d.periodo);
  const paid=Number(installment?.pagado||0);
  const settled=d.saldo!==null && d.saldo!==undefined && Number(d.saldo)===0;
  const roomText=room?` por la ${room}`:'';
  const message = receipt
    ? `Hemos recibido ${job.audiencia==='administrador'?'el pago de '+d.cliente:'su pago'} del mes de ${period} por ${money(d.monto)}${roomText}.${Number(d.saldo)>0?' Quedan '+money(d.saldo)+' pendientes de esta cuota.':!loan&&settled?' La mensualidad de '+period+' está pagada.'+(installment?' Total abonado en el mes: '+money(paid)+'.':''):''}`
    : `${paid>0?'Hemos recibido un abono de '+money(paid)+' del mes de '+period+'. Queda un saldo pendiente de '+money(d.saldo)+roomText:'No hemos recibido '+(job.audiencia==='administrador'?'el pago de '+d.cliente:'su pago')+' del mes de '+period+' por '+money(d.saldo)+roomText}. Le pedimos que realice su pago a la brevedad. Para más detalles, contáctese con administración${contact?' mediante '+contact:''}. Si ya realizó el pago, por favor envíe el comprobante por WhatsApp${whatsapp?' al '+whatsapp:' a administración'}.`;
  const rows = receipt
    ? [['Cliente',d.cliente],['Concepto',room||concept],['Período',d.periodo],['Fecha de recepción',d.fecha],['Monto recibido',money(d.monto)],['Abono',money(d.capital)],['Interés',money(d.interes)],['Referencia',d.referencia]]
    : [['Vencimiento',d.vencimiento],['Días de atraso',d.dias_atraso],['Saldo pendiente',money(d.saldo)]];
  if (receipt && d.saldo !== null && d.saldo !== undefined) rows.push(['Saldo de la cuota',money(d.saldo)]);
  if(receipt && !loan){
    if(installment){rows.push(['Mensualidad',money(installment.mensualidad)],['Total pagado del mes',money(paid)]);}
    if(d.saldo!==null && d.saldo!==undefined)rows.push(['Estado del mes',settled?'Pagado':'Pago parcial']);
  }
  if(loan) {
    if(d.capital_inicial!=null)rows.push(['Capital inicial del préstamo',money(d.capital_inicial)]);
    if(d.tasa_mensual!=null)rows.push(['Tasa mensual',`${d.tasa_mensual}%`]);
    if(d.abonos_capital!=null)rows.push(['Total abonado a capital',money(d.abonos_capital)]);
    if(d.saldo_capital!=null)rows.push(['Saldo de capital pendiente',money(d.saldo_capital)]);
  }
  // Los arriendos usan el comprobante simple; solo los prestamos llevan historial.
  const history=loan ? renderHistory(d) : {html:'',text:''};
  const simpleReminder=!loan && !receipt;
  const reminderDetails=[['Habitación',room||concept],['Período',period],['Vencimiento',d.vencimiento],['Días de atraso',d.dias_atraso]];
  const detailsHtml=simpleReminder
    ? `<p style="font-size:14px;line-height:1.8;margin:20px 0">${reminderDetails.map(([key,value])=>`<strong>${escape(key)}:</strong> ${escape(value)}`).join('<br>')}</p>`
    : `<h2 style="font-size:16px;margin:24px 0 8px">${receipt?'Detalle del pago':'Detalle del vencimiento'}</h2><table width="100%" cellspacing="0" style="border-collapse:collapse">${rows.map(([k,v])=>`<tr><th scope="row" align="left" style="width:48%;padding:12px 8px 12px 0;border-bottom:1px solid #e1e8df;font-size:13px;font-weight:normal;color:#64766b">${escape(k)}</th><td align="right" style="padding:12px 0;border-bottom:1px solid #e1e8df;font-size:13px;overflow-wrap:anywhere">${escape(v)}</td></tr>`).join('')}</table>`;
  const logo=loan && /^https:\/\//i.test(logoUrl||'')?`<img src="${escape(logoUrl)}" alt="Antonini Inversiones" width="110" style="display:block;width:110px;max-width:100%;height:auto;margin:0 0 16px">`:'';
  const testNotice = d.es_prueba ? 'PRUEBA · Los montos son ejemplos. Este correo no registra un pago ni modifica su deuda.' : '';
  const text = [testNotice,location,title,greeting,message,...(simpleReminder?[...reminderDetails,['Saldo pendiente',money(d.saldo)]]:rows).map(([k,v])=>`${k}: ${v}`),history.text,brand].filter(Boolean).join('\n\n');
  const digits = whatsapp.replace(/\D/g,'');
  const link = digits && !receipt ? `<p><a href="https://wa.me/${digits}" style="color:#23745b">Enviar comprobante por WhatsApp</a></p>` : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media only screen and (max-width:560px){.loan-history thead{display:none!important}.loan-history,.loan-history tbody,.loan-history tr,.loan-history td{display:block!important;width:100%!important;box-sizing:border-box}.loan-history tr{margin-bottom:14px;border:1px solid #dce5dc;border-radius:8px;padding:6px}.loan-history td{text-align:right!important;font-size:12px!important;padding:9px 5px!important;overflow-wrap:normal!important}.loan-history .history-label{display:block!important;float:left;width:52%;text-align:left;font-size:11px;color:#64766b}}</style></head><body style="margin:0;background:#f4f6f0;font-family:Arial,sans-serif;color:#203a32"><table role="presentation" width="100%" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" style="max-width:${loan?720:580}px;background:#fff;border:1px solid #e1e8df;border-radius:16px;overflow:hidden"><tr><td style="padding:24px;background:#174f40;color:#fff">${logo}<p style="font-size:20px;font-weight:bold;margin:0">${escape(brand)}</p><p style="font-size:12px;margin:8px 0 0;color:#d7e9dd">${escape(location)}</p></td></tr><tr><td style="padding:24px">${testNotice?`<p style="padding:12px;background:#fff4d9;color:#795713;font-size:12px;line-height:1.6;border-radius:8px">${escape(testNotice)}</p>`:''}<h1 style="font-size:25px;margin:12px 0 24px">${title}</h1><p style="font-size:17px;font-weight:bold">${escape(greeting)}</p><p style="line-height:1.7;font-size:14px">${escape(message)}</p>${receipt||simpleReminder?`<table role="presentation" width="100%" style="margin:24px 0;background:#eef6f0;border-radius:10px"><tr><td style="padding:18px"><span style="font-size:12px;color:#526b5e">${simpleReminder?'MONTO PENDIENTE':d.es_prueba?'MONTO DE EJEMPLO':'MONTO RECIBIDO'}</span><p style="font-size:30px;font-weight:bold;margin:8px 0 0;color:#17634b">${escape(money(simpleReminder?d.saldo:d.monto))}<span style="font-size:12px;font-weight:normal"> CLP</span></p></td></tr></table>`:''}${detailsHtml}${history.html}${link}<p style="font-size:12px;line-height:1.6;color:#67786f;margin-top:24px">${d.es_prueba?'Demostración del comprobante que recibirán el cliente y administración.':receipt?'Conserve este comprobante. El saldo indicado corresponde a esta cuota.':'Si ya pagaste, envíanos el comprobante para revisar el registro.'}</p><p style="font-size:12px;line-height:1.6;color:#67786f">Si necesita ayuda, responda a este correo${whatsapp?' o contáctenos al '+escape(whatsapp):''}.</p></td></tr></table><p style="font-size:11px;color:#7a887e">${escape(brand)}</p></td></tr></table></body></html>`;
  return { subject: `${d.es_prueba?'[PRUEBA] ':''}${brand} · ${title} · ${room||concept} · ${d.periodo}`, text, html };
}

class MailError extends Error {
  constructor(message, permanent = false) { super(message); this.permanent = permanent; }
}
async function sendEmail(payload, { provider, apiKey, fetchFn = fetch }) {
  let response;
  try {
    response = await fetchFn(provider === 'brevo' ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
      method:'POST', headers: provider === 'brevo'
        ? {'Content-Type':'application/json','api-key':apiKey}
        : {'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`,'Idempotency-Key':payload.key},
      body:JSON.stringify(payload.body),signal:AbortSignal.timeout(12000)
    });
  } catch { throw new MailError('El proveedor no confirmó el resultado. Revisar antes de reenviar.', provider === 'brevo'); }
  if (!response.ok) {
    // Brevo uncertain outcomes are reviewed, rather than blindly sent twice.
    throw new MailError(`Proveedor de correo: HTTP ${response.status}`, (response.status >= 400 && response.status < 500 && ![408,429].includes(response.status)) || (provider === 'brevo' && response.status !== 429));
  }
  const result = await response.json();
  const id = provider === 'brevo' ? result.messageId : result.id;
  if (!id) throw new MailError('Respuesta sin identificador. Revisar el proveedor.', provider === 'brevo');
  return id;
}
function buildPayload(job, config) {
  const message = renderEmail(job,job.datos.whatsapp || config.whatsapp || '',config.logoUrl || DEFAULT_LOAN_LOGO,config.replyTo || '');
  const body = config.provider === 'brevo'
    ? {sender:{name:serviceBrand(job.datos),email:config.from},to:[{email:job.destinatario}],replyTo:{email:config.replyTo},subject:message.subject,htmlContent:message.html,textContent:message.text}
    : {from:`${serviceBrand(job.datos)} <${config.from}>`,to:[job.destinatario],reply_to:config.replyTo,subject:message.subject,html:message.html,text:message.text};
  return {provider:config.provider,key:`antonini/${job.id}`,body};
}
async function runBatch({rpc,config,fetchFn=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}) {
  const jobs = await rpc('reclamar_correos',{p_limite:10});
  const result={accepted:0,review:0,retry:0,cancelled:0};
  for (const job of jobs) {
    const valid = await rpc('validar_correo_envio',{p_id:job.id,p_token:job.token_bloqueo});
    if (!valid) { result.cancelled++; continue; }
    const payload = await rpc('congelar_solicitud_correo',{p_id:job.id,p_token:job.token_bloqueo,p_solicitud:buildPayload(job,config)});
    if (!payload) continue;
    try {
      if(payload.provider!==config.provider)throw new MailError('El proveedor cambió después del primer intento. Revisar.',true);
      const id=await sendEmail(payload,{provider:config.provider,apiKey:config.apiKey,fetchFn});
      const confirmed=await rpc('confirmar_correo',{p_id:job.id,p_token:job.token_bloqueo,p_proveedor_id:id});
      if(!confirmed)throw new MailError('No se confirmó el registro de envío.',config.provider==='brevo');
      result.accepted++;
    } catch(error) {
      const permanent=error.permanent ?? (config.provider==='brevo');
      await rpc('fallar_correo',{p_id:job.id,p_token:job.token_bloqueo,p_error:error.message,p_permanente:permanent});
      result[permanent?'review':'retry']++;
    }
    await pause(600);
  }
  return result;
}


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
