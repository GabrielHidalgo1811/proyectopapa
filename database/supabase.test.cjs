const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('Supabase: migrations, import, payments, notifications and access rules',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
 for(const f of ['supabase.sql','02_correos_automaticos.sql','03_inquilinos_casa_pac.sql','04_conectar_aplicacion.sql','06_historial_correos.sql'])await pg.exec(fs.readFileSync('database/'+f,'utf8'));
 await t.test('imports only confirmed data, with no invented dates or emails',async()=>{
  const {rows}=await pg.query(`SELECT count(*)::int n,sum(mensualidad)::int total,count(dia_vencimiento)::int calendarios FROM public.habitaciones`);assert.deepEqual(rows[0],{n:12,total:2460000,calendarios:0});
  assert.equal((await pg.query('SELECT count(*)::int n FROM public.personas')).rows[0].n,9);
  assert.equal((await pg.query('SELECT count(*)::int n FROM public.pagos')).rows[0].n,0);
  await pg.exec('SELECT public.generar_cuotas()');assert.equal((await pg.query('SELECT count(*)::int n FROM public.cuotas_cobro')).rows[0].n,0);
  await pg.exec(fs.readFileSync('database/03_inquilinos_casa_pac.sql','utf8'));assert.equal((await pg.query('SELECT count(*)::int n FROM public.habitaciones')).rows[0].n,12);
 });
 await t.test('does not expose contacts or queue operations to anonymous users',async()=>{
  await pg.exec('SET ROLE anon');await assert.rejects(pg.query('SELECT * FROM public.personas'),/permission denied/);await assert.rejects(pg.query('SELECT public.reclamar_correos(1)'),/permission denied/);await pg.exec('RESET ROLE');
 });
 await t.test('round-trips a state snapshot and detects stale saves',async()=>{
  const state=(await pg.query('SELECT public.leer_estado_antonini() AS estado')).rows[0].estado;
  const saved=(await pg.query('SELECT public.guardar_estado_antonini($1,$2::jsonb) AS estado',[state.revision,JSON.stringify(state.data)])).rows[0].estado;
  assert.equal(saved.revision,1);assert.equal(saved.data.people.length,9);
  await assert.rejects(pg.query('SELECT public.guardar_estado_antonini($1,$2::jsonb)',[0,JSON.stringify(state.data)]),/otra sesión/);
 });
 await t.test('creates two receipts per committed payment and never mails on rollback',async()=>{
  await pg.exec(`UPDATE public.habitaciones SET dia_vencimiento=1,fecha_inicio=date_trunc('month',current_date)::date WHERE id='I-PAC-01';SELECT public.generar_cuotas();`);
  await pg.query(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('testpago','I-PAC-01',to_char(current_date,'YYYY-MM'),current_date,50000,50000,0)`);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM public.correos_automaticos WHERE pago_id='testpago'`)).rows[0].n,2);
  assert.equal((await pg.query(`SELECT saldo::int saldo FROM public.saldos_cuotas WHERE habitacion_id='I-PAC-01'`)).rows[0].saldo,120000);
  await assert.rejects(pg.exec(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('sobrepago','I-PAC-01',to_char(current_date,'YYYY-MM'),current_date,500000,500000,0)`),/supera el saldo/);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM public.correos_automaticos`)).rows[0].n,2);
 });
 await t.test('seven-day boundary, reminder deduplication, missing contacts and cancellation after payment',async()=>{
  await pg.exec(`INSERT INTO public.cuotas_cobro(habitacion_id,persona_id,periodo,fecha_vencimiento,monto) VALUES('I-PAC-02','C-PAC-02',date_trunc('month',current_date)::date,current_date-6,200000);SELECT public.preparar_avisos_atraso();`);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM public.correos_automaticos WHERE tipo='atraso_7_dias' AND persona_id='C-PAC-02'`)).rows[0].n,0);
  await pg.exec(`UPDATE public.cuotas_cobro SET fecha_vencimiento=current_date-7 WHERE habitacion_id='I-PAC-02';SELECT public.preparar_avisos_atraso();SELECT public.preparar_avisos_atraso();`);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM public.correos_automaticos WHERE tipo='atraso_7_dias' AND persona_id='C-PAC-02'`)).rows[0].n,2);
  assert.equal((await pg.query('SELECT * FROM public.reclamar_correos(10)')).rows.length,0); // disabled until configured
  await pg.exec(`UPDATE public.configuracion SET correo_habilitado=true;`);
  const jobs=(await pg.query('SELECT * FROM public.reclamar_correos(10)')).rows;assert(jobs.every(j=>j.audiencia==='administrador'));
  await pg.exec(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('pago2','I-PAC-02',to_char(current_date,'YYYY-MM'),current_date,200000,200000,0);`);
  for(const j of jobs.filter(j=>j.persona_id==='C-PAC-02'))assert.equal((await pg.query('SELECT public.validar_correo_envio($1,$2) AS valido',[j.id,j.token_bloqueo])).rows[0].valido,false);
 });
 await t.test('six-month rental snapshot retains unpaid months, combines partial payments and identifies the room',async()=>{
  await pg.exec(`UPDATE public.habitaciones SET fecha_inicio=(date_trunc('month',current_date)-interval '5 months')::date WHERE id='I-PAC-01';SELECT public.generar_cuotas();
  INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('abono-extra','I-PAC-01',to_char(current_date,'YYYY-MM'),current_date,70000,70000,0);`);
  const d=(await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='abono-extra' LIMIT 1`)).rows[0].datos;
  assert.equal(d.habitacion,'Habitación 01');assert.equal(d.inmueble,'Casa PAC');assert.equal(d.historial.length,6);
  assert.equal(d.historial[0].pagado,0);assert.equal(d.historial[0].fecha,null);
  assert.equal(d.historial[5].pagado,120000);assert.equal(d.historial[5].saldo,50000);
  const before=JSON.stringify(d.historial);
  await pg.exec(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('completa','I-PAC-01',to_char(current_date,'YYYY-MM'),current_date,50000,50000,0);`);
  assert.equal(JSON.stringify((await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='abono-extra' LIMIT 1`)).rows[0].datos.historial),before);
  const full=(await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='completa' LIMIT 1`)).rows[0].datos;
  assert.equal(full.historial[5].saldo,0);assert.equal(full.historial[5].pagado,170000);
 });
 await t.test('loan history shows missing months without inventing interest payments or principal reductions',async()=>{
  await pg.exec(`INSERT INTO public.prestamos(id,deudor_id,aval_id,capital,tasa_mensual,cuota_mensual,dia_vencimiento,capitalista,fecha_inicio) VALUES('prestamo-test','C-PAC-03','C-PAC-04',1200000,5,140000,1,'Prueba',(date_trunc('month',current_date)-interval '5 months')::date);
  SELECT public.generar_cuotas();
  INSERT INTO public.pagos(id,prestamo_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('prestamo-abono','prestamo-test',to_char(current_date,'YYYY-MM'),current_date,100000,40000,60000);`);
  const d=(await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='prestamo-abono' LIMIT 1`)).rows[0].datos;
  assert.equal(d.tipo_contrato,'prestamo');assert.equal(d.historial.length,6);assert.equal(d.saldo_capital,1160000);
  assert.equal(d.historial[0].pagado,0);assert.equal(d.historial[0].interes,0);assert.equal(d.historial[0].capital,0);
  assert.equal(d.historial[5].pagado,100000);assert.equal(d.historial[5].saldo,40000);assert.equal(d.historial[5].capital_antes,1200000);
  await pg.exec('SET ROLE anon');await assert.rejects(pg.query(`SELECT public.detalle_correo_contrato(1,current_date)`),/permission denied/);await pg.exec('RESET ROLE');
 });
 await t.test('190000 rent: 120000 leaves 70000 and a second 70000 completes only that monthly installment',async()=>{
  await pg.exec(`UPDATE public.habitaciones SET dia_vencimiento=1,fecha_inicio=date_trunc('month',current_date)::date WHERE id='I-PAC-03';SELECT public.generar_cuotas();
  INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('r190-parcial','I-PAC-03',to_char(current_date,'YYYY-MM'),current_date,120000,120000,0);`);
  const partial=(await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='r190-parcial' LIMIT 1`)).rows[0].datos;
  assert.equal(partial.saldo,70000);assert.equal(partial.historial[0].pagado,120000);
  await pg.exec(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('r190-completo','I-PAC-03',to_char(current_date,'YYYY-MM'),current_date,70000,70000,0);`);
  const receipts=(await pg.query(`SELECT datos FROM public.correos_automaticos WHERE pago_id='r190-completo'`)).rows;
  assert.equal(receipts.length,2);for(const {datos} of receipts){assert.equal(datos.monto,70000);assert.equal(datos.saldo,0);assert.equal(datos.historial[0].pagado,190000);assert.equal(datos.historial[0].mensualidad,190000);}
  await assert.rejects(pg.exec(`INSERT INTO public.pagos(id,habitacion_id,periodo,fecha_recepcion,monto,abono_capital,interes) VALUES('r190-exceso','I-PAC-03',to_char(current_date,'YYYY-MM'),current_date,1,1,0);`),/supera el saldo/);
 });
 await t.test('schedule SQL validates with mocked Supabase extensions and remains one global job',async()=>{
  await pg.exec(`CREATE SCHEMA vault;CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);CREATE SCHEMA net;
  CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
  CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text);
  CREATE FUNCTION cron.schedule(nombre text,calendario text,comando text) RETURNS bigint LANGUAGE sql AS 'INSERT INTO cron.job(jobname) VALUES(nombre) RETURNING jobid';
  CREATE FUNCTION cron.unschedule(identificador bigint) RETURNS boolean LANGUAGE sql AS 'WITH borrado AS (DELETE FROM cron.job WHERE jobid=identificador RETURNING jobid) SELECT count(*)>0 FROM borrado';`);
  const script=fs.readFileSync('database/05_programar_correos.sql','utf8').replace(/^CREATE EXTENSION.*$/gm,'');
  await pg.exec(script);await pg.exec(script);assert.equal((await pg.query('SELECT count(*)::int n FROM cron.job')).rows[0].n,1);
  await pg.exec('SET ROLE anon');await assert.rejects(pg.query('SELECT public.despertar_procesador_correos()'),/permission denied/);await pg.exec('RESET ROLE');
 });

});
