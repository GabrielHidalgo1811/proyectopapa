-- MIGRACION 04: API transaccional del servidor local hacia Supabase.
-- Ejecutar DESPUES de 02 y 03. Solo service_role puede ejecutar estas RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.leer_estado_antonini()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
SELECT jsonb_build_object('revision',(SELECT revision FROM public.metadatos WHERE id=1),'data',jsonb_build_object(
 'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.nombre,'phone',coalesce(p.telefono,''),'email',coalesce(p.correo,''),
   'roles',coalesce((SELECT jsonb_agg(CASE rol WHEN 'inquilino' THEN 'tenant' ELSE 'guarantor' END ORDER BY rol) FROM public.roles_persona WHERE persona_id=p.id),'[]'::jsonb)) ORDER BY p.id) FROM public.personas p),'[]'::jsonb),
 'rooms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'name',h.nombre,'property',h.inmueble,'person',h.inquilino_id,'amount',h.mensualidad,'day',h.dia_vencimiento,'deposit',h.deposito,'startDate',h.fecha_inicio,'state',h.estado,
   'services',coalesce((SELECT jsonb_agg(jsonb_build_array(elemento,descripcion) ORDER BY posicion) FROM public.equipamiento_habitacion WHERE habitacion_id=h.id),'[]'::jsonb)) ORDER BY h.id) FROM public.habitaciones h),'[]'::jsonb),
 'loans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'person',p.deudor_id,'guarantor',p.aval_id,'capital',p.capital,'rate',p.tasa_mensual,'amount',p.cuota_mensual,'day',p.dia_vencimiento,'investor',p.capitalista,'startDate',p.fecha_inicio) ORDER BY p.id) FROM public.prestamos p),'[]'::jsonb),
 'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'ref',coalesce(p.habitacion_id,p.prestamo_id),'period',p.periodo,'date',p.fecha_recepcion,'amount',p.monto,'capital',p.abono_capital,'interest',p.interes) ORDER BY p.fecha_recepcion,p.id) FROM public.pagos p),'[]'::jsonb),
 'outbox',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',b.id,'subject',b.asunto,'to',b.destinatario,'body',b.mensaje,'date',b.fecha_creacion,'ref',coalesce(b.habitacion_id,b.prestamo_id))) ORDER BY b.posicion,b.id) FROM public.borradores b),'[]'::jsonb),
 'settings',(SELECT jsonb_build_object('email',correo_administracion,'phone',telefono_administracion,'interval',intervalo_recordatorios,'emailEnabled',correo_habilitado,'whatsapp',whatsapp_habilitado) FROM public.configuracion WHERE id=1)
));
$$;

CREATE OR REPLACE FUNCTION public.guardar_estado_antonini(p_revision bigint,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_revision bigint; r jsonb; s jsonb; i integer; v_previo jsonb; v_seccion text;
BEGIN
 SELECT revision INTO v_revision FROM public.metadatos WHERE id=1 FOR UPDATE;
 IF v_revision<>p_revision THEN RAISE EXCEPTION 'Los datos cambiaron en otra sesión. Recarga antes de guardar.' USING ERRCODE='40001'; END IF;
 v_previo=public.leer_estado_antonini()->'data';
 FOREACH v_seccion IN ARRAY ARRAY['people','rooms','loans','payments','outbox'] LOOP
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_previo->v_seccion) old_row WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_datos->v_seccion) new_row WHERE new_row->>'id'=old_row->>'id')) THEN
     RAISE EXCEPTION 'Esta operación no permite eliminar registros';
   END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'payments') LOOP
   SELECT value INTO s FROM jsonb_array_elements(v_previo->'payments') WHERE value->>'id'=r->>'id';
   IF FOUND AND s<>r THEN RAISE EXCEPTION 'Los pagos registrados no se pueden modificar'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'people') LOOP
   INSERT INTO public.personas(id,nombre,telefono,correo) VALUES(r->>'id',r->>'name',nullif(r->>'phone',''),nullif(r->>'email',''))
   ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,telefono=excluded.telefono,correo=excluded.correo;
   DELETE FROM public.roles_persona WHERE persona_id=r->>'id';
   INSERT INTO public.roles_persona(persona_id,rol) SELECT r->>'id',CASE value WHEN 'tenant' THEN 'inquilino' ELSE 'aval' END FROM jsonb_array_elements_text(r->'roles');
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'rooms') LOOP
   INSERT INTO public.habitaciones(id,nombre,inmueble,inquilino_id,mensualidad,dia_vencimiento,deposito,fecha_inicio,estado)
   VALUES(r->>'id',r->>'name','Casa PAC',r->>'person',(r->>'amount')::bigint,(r->>'day')::integer,(r->>'deposit')::bigint,(r->>'startDate')::date,coalesce(r->>'state',CASE WHEN r->>'person' IS NULL THEN 'disponible' ELSE 'ocupada' END))
   ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,inquilino_id=excluded.inquilino_id,mensualidad=excluded.mensualidad,dia_vencimiento=excluded.dia_vencimiento,deposito=excluded.deposito,fecha_inicio=excluded.fecha_inicio,estado=excluded.estado;
   DELETE FROM public.equipamiento_habitacion WHERE habitacion_id=r->>'id';
   INSERT INTO public.equipamiento_habitacion(habitacion_id,posicion,elemento,descripcion)
   SELECT r->>'id',(ordinality-1)::integer,value->>0,value->>1 FROM jsonb_array_elements(r->'services') WITH ORDINALITY;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'loans') LOOP
   INSERT INTO public.prestamos(id,deudor_id,aval_id,capital,tasa_mensual,cuota_mensual,dia_vencimiento,capitalista,fecha_inicio)
   VALUES(r->>'id',r->>'person',r->>'guarantor',(r->>'capital')::bigint,(r->>'rate')::numeric,(r->>'amount')::bigint,(r->>'day')::integer,r->>'investor',(r->>'startDate')::date)
   ON CONFLICT(id) DO UPDATE SET deudor_id=excluded.deudor_id,aval_id=excluded.aval_id,capital=excluded.capital,tasa_mensual=excluded.tasa_mensual,cuota_mensual=excluded.cuota_mensual,dia_vencimiento=excluded.dia_vencimiento,capitalista=excluded.capitalista,fecha_inicio=excluded.fecha_inicio;
 END LOOP;
 -- Cuotas y pagos se crean en la misma transaccion: el correo solo se encola si se confirma el pago.
 PERFORM public.generar_cuotas();
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'payments') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.pagos WHERE id=r->>'id') THEN
     INSERT INTO public.pagos(id,habitacion_id,prestamo_id,periodo,fecha_recepcion,monto,abono_capital,interes)
     VALUES(r->>'id',CASE WHEN left(r->>'ref',1)='I' THEN r->>'ref' END,CASE WHEN left(r->>'ref',1)='P' THEN r->>'ref' END,r->>'period',(r->>'date')::date,(r->>'amount')::bigint,(r->>'capital')::bigint,(r->>'interest')::bigint);
   END IF;
 END LOOP;
 i=0;
 FOR r IN SELECT * FROM jsonb_array_elements(p_datos->'outbox') LOOP
   INSERT INTO public.borradores(id,posicion,asunto,destinatario,mensaje,fecha_creacion,habitacion_id,prestamo_id)
   VALUES(r->>'id',i,r->>'subject',r->>'to',r->>'body',(r->>'date')::date,CASE WHEN left(r->>'ref',1)='I' THEN r->>'ref' END,CASE WHEN left(r->>'ref',1)='P' THEN r->>'ref' END)
   ON CONFLICT(id) DO UPDATE SET posicion=excluded.posicion;
   i=i+1;
 END LOOP;
 s=p_datos->'settings';
 UPDATE public.configuracion SET correo_administracion=s->>'email',telefono_administracion=s->>'phone',intervalo_recordatorios=(s->>'interval')::integer,correo_habilitado=(s->>'emailEnabled')::boolean,whatsapp_habilitado=(s->>'whatsapp')::boolean WHERE id=1;
 UPDATE public.metadatos SET revision=revision+1 WHERE id=1;
 RETURN public.leer_estado_antonini();
END $$;
REVOKE ALL ON FUNCTION public.leer_estado_antonini(),public.guardar_estado_antonini(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leer_estado_antonini(),public.guardar_estado_antonini(bigint,jsonb) TO service_role;


-- Consultas del panel web y del historial de correo (solo servidor).
CREATE OR REPLACE FUNCTION public.consultar_alertas_antonini()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM public.generar_cuotas();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'referencia',coalesce(s.habitacion_id,s.prestamo_id),'nombre',p.nombre,'correo',p.correo,'concepto',coalesce(h.nombre,'Préstamo '||s.prestamo_id),'periodo',to_char(s.periodo,'YYYY-MM'),'saldo',s.saldo,'dias_atraso',s.dias_atraso,'vencimiento',s.fecha_vencimiento) ORDER BY s.fecha_vencimiento),'[]'::jsonb)
 INTO resultado FROM public.saldos_cuotas s JOIN public.personas p ON p.id=s.persona_id LEFT JOIN public.habitaciones h ON h.id=s.habitacion_id
 WHERE s.saldo>0 AND s.dias_atraso>=7;
 RETURN resultado;
END $$;
CREATE OR REPLACE FUNCTION public.consultar_correos_antonini()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM
 (SELECT id,tipo,audiencia,destinatario,estado,intentos,ultimo_error,creado_en,aceptado_en FROM public.correos_automaticos ORDER BY creado_en DESC LIMIT 100) c;
$$;
REVOKE ALL ON FUNCTION public.consultar_alertas_antonini(),public.consultar_correos_antonini() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_alertas_antonini(),public.consultar_correos_antonini() TO service_role;
GRANT ALL ON public.personas,public.roles_persona,public.habitaciones,public.equipamiento_habitacion,public.prestamos,public.pagos,public.borradores,public.configuracion,public.metadatos TO service_role;

COMMIT;
