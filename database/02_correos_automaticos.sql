-- MIGRACION 02: correos automaticos y cuotas. Ejecutar DESPUES del esquema en espanol.
-- No ejecutar otra vez el archivo de reinicio database/supabase.sql.
BEGIN;

-- Contactos pendientes: no inventar correos ni telefonos al importar planillas.
ALTER TABLE public.personas ALTER COLUMN correo DROP NOT NULL;
ALTER TABLE public.personas ALTER COLUMN telefono DROP NOT NULL;
ALTER TABLE public.habitaciones ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE public.habitaciones ADD COLUMN IF NOT EXISTS fecha_fin date;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_fin date;

CREATE TABLE IF NOT EXISTS public.cuotas_cobro (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  habitacion_id text REFERENCES public.habitaciones(id),
  prestamo_id text REFERENCES public.prestamos(id),
  persona_id text NOT NULL REFERENCES public.personas(id),
  periodo date NOT NULL CHECK (extract(day FROM periodo) = 1),
  fecha_vencimiento date NOT NULL,
  monto bigint NOT NULL CHECK (monto > 0),
  CHECK ((habitacion_id IS NOT NULL) <> (prestamo_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cuota_habitacion_periodo ON public.cuotas_cobro(habitacion_id,periodo) WHERE habitacion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cuota_prestamo_periodo ON public.cuotas_cobro(prestamo_id,periodo) WHERE prestamo_id IS NOT NULL;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS cuota_id bigint REFERENCES public.cuotas_cobro(id);

CREATE TABLE IF NOT EXISTS public.correos_automaticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave_evento text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('pago_recibido','atraso_7_dias')),
  audiencia text NOT NULL CHECK (audiencia IN ('cliente','administrador')),
  pago_id text REFERENCES public.pagos(id),
  cuota_id bigint REFERENCES public.cuotas_cobro(id),
  persona_id text NOT NULL REFERENCES public.personas(id),
  destinatario text,
  datos jsonb NOT NULL,
  solicitud_proveedor jsonb,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviando','aceptado','revision','cancelado')),
  intentos integer NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  primer_intento timestamptz,
  bloqueado_hasta timestamptz,
  token_bloqueo uuid,
  proveedor_id text,
  ultimo_error text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  aceptado_en timestamptz
);
CREATE INDEX IF NOT EXISTS correos_pendientes_idx ON public.correos_automaticos(estado,proximo_intento);

-- Sin fecha de inicio confirmada NO se crean deudas ni avisos retroactivos.
CREATE OR REPLACE FUNCTION public.generar_cuotas(p_hoy date DEFAULT (now() AT TIME ZONE 'America/Santiago')::date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.cuotas_cobro(habitacion_id,persona_id,periodo,fecha_vencimiento,monto)
  SELECT h.id,h.inquilino_id,m::date,(m::date+h.dia_vencimiento-1),h.mensualidad
  FROM public.habitaciones h
  CROSS JOIN LATERAL generate_series(date_trunc('month',h.fecha_inicio),date_trunc('month',least(p_hoy,coalesce(h.fecha_fin,p_hoy))),interval '1 month') m
  WHERE h.inquilino_id IS NOT NULL AND h.fecha_inicio IS NOT NULL
    AND m::date+h.dia_vencimiento-1 >= h.fecha_inicio
    AND (h.fecha_fin IS NULL OR m::date+h.dia_vencimiento-1 <= h.fecha_fin)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.cuotas_cobro(prestamo_id,persona_id,periodo,fecha_vencimiento,monto)
  SELECT p.id,p.deudor_id,m::date,(m::date+p.dia_vencimiento-1),
    least(p.cuota_mensual,saldo.capital+round(saldo.capital*p.tasa_mensual/100)::bigint)
  FROM public.prestamos p
  CROSS JOIN LATERAL generate_series(date_trunc('month',p.fecha_inicio),date_trunc('month',least(p_hoy,coalesce(p.fecha_fin,p_hoy))),interval '1 month') m
  CROSS JOIN LATERAL (SELECT greatest(0,p.capital-coalesce(sum(abono_capital),0))::bigint AS capital
    FROM public.pagos WHERE prestamo_id=p.id AND periodo<to_char(m,'YYYY-MM')) saldo
  WHERE p.fecha_inicio IS NOT NULL AND saldo.capital>0
    AND m::date+p.dia_vencimiento-1 >= p.fecha_inicio
    AND (p.fecha_fin IS NULL OR m::date+p.dia_vencimiento-1 <= p.fecha_fin)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE VIEW public.saldos_cuotas WITH (security_invoker=true) AS
SELECT c.*,coalesce(sum(p.monto),0)::bigint AS pagado,
  greatest(0,c.monto-coalesce(sum(p.monto),0))::bigint AS saldo,
  greatest(0,(now() AT TIME ZONE 'America/Santiago')::date-c.fecha_vencimiento) AS dias_atraso
FROM public.cuotas_cobro c LEFT JOIN public.pagos p
  ON (c.habitacion_id=p.habitacion_id OR c.prestamo_id=p.prestamo_id) AND p.periodo=to_char(c.periodo,'YYYY-MM')
GROUP BY c.id;

CREATE OR REPLACE FUNCTION public.preparar_aviso_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_persona text; v_concepto text; v_nombre text; v_saldo bigint; v_datos jsonb; v_audiencia text;
BEGIN
  IF NEW.habitacion_id IS NOT NULL THEN
    SELECT inquilino_id,nombre INTO v_persona,v_concepto FROM public.habitaciones WHERE id=NEW.habitacion_id;
  ELSE
    SELECT deudor_id,'Préstamo '||id INTO v_persona,v_concepto FROM public.prestamos WHERE id=NEW.prestamo_id;
  END IF;
  SELECT persona_id INTO v_persona FROM public.cuotas_cobro WHERE id=NEW.cuota_id;
  IF v_persona IS NULL THEN RAISE EXCEPTION 'El pago no tiene un cliente asociado'; END IF;
  SELECT nombre INTO v_nombre FROM public.personas WHERE id=v_persona;
  SELECT saldo INTO v_saldo FROM public.saldos_cuotas WHERE id=NEW.cuota_id;
  v_datos=jsonb_build_object('cliente',v_nombre,'concepto',v_concepto,'periodo',NEW.periodo,'fecha',NEW.fecha_recepcion,
    'monto',NEW.monto,'capital',NEW.abono_capital,'interes',NEW.interes,'saldo',v_saldo,'referencia',NEW.id,'whatsapp',(SELECT telefono_administracion FROM public.configuracion WHERE id=1));
  FOREACH v_audiencia IN ARRAY ARRAY['cliente','administrador'] LOOP
    INSERT INTO public.correos_automaticos(clave_evento,tipo,audiencia,pago_id,cuota_id,persona_id,datos,destinatario)
    VALUES ('pago:'||NEW.id||':'||v_audiencia,'pago_recibido',v_audiencia,NEW.id,NEW.cuota_id,v_persona,v_datos,CASE WHEN v_audiencia='cliente' THEN (SELECT correo FROM public.personas WHERE id=v_persona) ELSE (SELECT correo_administracion FROM public.configuracion WHERE id=1) END)
    ON CONFLICT (clave_evento) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

-- Bloqueo por cuota: dos pagos simultaneos no pueden superar su saldo.
CREATE OR REPLACE FUNCTION public.vincular_pago_cuota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cuota public.cuotas_cobro; v_pagado bigint; v_prestamo public.prestamos; v_capital_antes bigint; v_interes_pagado bigint; v_capital_total bigint; v_interes bigint;
BEGIN
  PERFORM public.generar_cuotas();
  SELECT * INTO v_cuota FROM public.cuotas_cobro
    WHERE (habitacion_id=NEW.habitacion_id OR prestamo_id=NEW.prestamo_id)
      AND periodo=to_date(NEW.periodo||'-01','YYYY-MM-DD') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirma la fecha de inicio del contrato y el periodo antes de registrar el pago'; END IF;
  SELECT coalesce(sum(monto),0) INTO v_pagado FROM public.pagos
    WHERE (habitacion_id=NEW.habitacion_id OR prestamo_id=NEW.prestamo_id) AND periodo=NEW.periodo;
  IF NEW.monto+v_pagado>v_cuota.monto THEN RAISE EXCEPTION 'El pago supera el saldo de la cuota'; END IF;
  IF NEW.fecha_recepcion>(now() AT TIME ZONE 'America/Santiago')::date THEN RAISE EXCEPTION 'La fecha del pago no puede ser futura'; END IF;
  IF NEW.prestamo_id IS NOT NULL THEN
    SELECT * INTO v_prestamo FROM public.prestamos WHERE id=NEW.prestamo_id FOR UPDATE;
    SELECT coalesce(sum(abono_capital) FILTER (WHERE periodo<NEW.periodo),0),coalesce(sum(interes) FILTER (WHERE periodo=NEW.periodo),0),coalesce(sum(abono_capital),0)
      INTO v_capital_antes,v_interes_pagado,v_capital_total FROM public.pagos WHERE prestamo_id=NEW.prestamo_id;
    v_interes=least(NEW.monto,greatest(0,round(greatest(0,v_prestamo.capital-v_capital_antes)*v_prestamo.tasa_mensual/100)::bigint-v_interes_pagado));
    IF NEW.interes<>v_interes THEN RAISE EXCEPTION 'El desglose de interes no coincide con el saldo'; END IF;
    IF NEW.abono_capital+v_capital_total>v_prestamo.capital THEN RAISE EXCEPTION 'El abono supera el capital pendiente'; END IF;
  END IF;
  NEW.cuota_id=v_cuota.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vincular_pago_cuota ON public.pagos;
CREATE TRIGGER vincular_pago_cuota BEFORE INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.vincular_pago_cuota();
DROP TRIGGER IF EXISTS preparar_aviso_pago ON public.pagos;
CREATE TRIGGER preparar_aviso_pago AFTER INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.preparar_aviso_pago();

CREATE OR REPLACE FUNCTION public.preparar_avisos_atraso()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.generar_cuotas();
  INSERT INTO public.correos_automaticos(clave_evento,tipo,audiencia,cuota_id,persona_id,datos)
  SELECT 'atraso:'||s.id||':'||a.audiencia,'atraso_7_dias',a.audiencia,s.id,s.persona_id,
    jsonb_build_object('cliente',p.nombre,'concepto',coalesce(h.nombre,'Préstamo '||s.prestamo_id),
      'periodo',to_char(s.periodo,'YYYY-MM'),'vencimiento',s.fecha_vencimiento,'saldo',s.saldo,'dias_atraso',s.dias_atraso,'whatsapp',(SELECT telefono_administracion FROM public.configuracion WHERE id=1))
  FROM public.saldos_cuotas s JOIN public.personas p ON p.id=s.persona_id
  LEFT JOIN public.habitaciones h ON h.id=s.habitacion_id
  CROSS JOIN (VALUES ('cliente'),('administrador')) a(audiencia)
  WHERE s.saldo>0 AND s.dias_atraso>=7
  ON CONFLICT (clave_evento) DO NOTHING;
  UPDATE public.correos_automaticos c SET estado='cancelado',ultimo_error='Cuota pagada antes del envío'
  FROM public.saldos_cuotas s WHERE c.cuota_id=s.id AND c.tipo='atraso_7_dias' AND c.estado='pendiente' AND s.saldo=0;
  -- Se actualiza el saldo del aviso SOLO antes de su primer intento.
  UPDATE public.correos_automaticos c SET datos=c.datos||jsonb_build_object('saldo',s.saldo,'dias_atraso',s.dias_atraso)
  FROM public.saldos_cuotas s WHERE c.cuota_id=s.id AND c.tipo='atraso_7_dias' AND c.estado='pendiente' AND c.primer_intento IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reclamar_correos(p_limite integer DEFAULT 10)
RETURNS SETOF public.correos_automaticos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.preparar_avisos_atraso();
  IF NOT coalesce((SELECT correo_habilitado FROM public.configuracion WHERE id=1),false) THEN RETURN; END IF;
  -- No reintentar a ciegas fuera de la ventana de idempotencia del proveedor.
  UPDATE public.correos_automaticos SET estado='revision',ultimo_error='Revisar en Resend antes de reenviar: primer intento hace más de 23 horas'
  WHERE estado IN ('pendiente','enviando') AND primer_intento<now()-interval '23 hours';
  UPDATE public.correos_automaticos SET estado=CASE WHEN solicitud_proveedor->>'provider'='brevo' THEN 'revision' ELSE 'pendiente' END,ultimo_error='El procesador se interrumpió; comprobar el proveedor antes de reintentar'
  WHERE estado='enviando' AND bloqueado_hasta<now();
  UPDATE public.correos_automaticos c SET destinatario=CASE WHEN c.audiencia='cliente' THEN p.correo ELSE s.correo_administracion END
  FROM public.personas p,public.configuracion s
  WHERE c.persona_id=p.id AND s.id=1 AND c.estado='pendiente' AND c.primer_intento IS NULL;
  UPDATE public.correos_automaticos SET ultimo_error='Falta completar el correo del destinatario'
  WHERE estado='pendiente' AND (destinatario IS NULL OR destinatario !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  RETURN QUERY
  WITH seleccion AS (
    SELECT id FROM public.correos_automaticos WHERE estado='pendiente' AND proximo_intento<=now()
      AND intentos<8 AND destinatario ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ORDER BY creado_en,id LIMIT least(greatest(p_limite,1),10) FOR UPDATE SKIP LOCKED
  ) UPDATE public.correos_automaticos c SET estado='enviando',token_bloqueo=gen_random_uuid(),
    bloqueado_hasta=now()+interval '10 minutes',primer_intento=coalesce(primer_intento,now()),intentos=intentos+1,ultimo_error=NULL
  FROM seleccion s WHERE c.id=s.id RETURNING c.*;
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_correo(p_id uuid,p_token uuid,p_proveedor_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.correos_automaticos SET estado='aceptado',proveedor_id=p_proveedor_id,aceptado_en=now(),bloqueado_hasta=NULL
  WHERE id=p_id AND token_bloqueo=p_token AND estado='enviando';
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.fallar_correo(p_id uuid,p_token uuid,p_error text,p_permanente boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.correos_automaticos SET estado=CASE WHEN p_permanente OR intentos>=8 THEN 'revision' ELSE 'pendiente' END,
    ultimo_error=left(p_error,500),proximo_intento=now()+make_interval(secs=>least(3600,power(2,intentos)::integer*60)),bloqueado_hasta=NULL
  WHERE id=p_id AND token_bloqueo=p_token AND estado='enviando';
  RETURN FOUND;
END $$;

ALTER TABLE public.cuotas_cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correos_automaticos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuotas_cobro,public.correos_automaticos FROM anon,authenticated;
GRANT SELECT ON public.cuotas_cobro,public.correos_automaticos,public.saldos_cuotas TO authenticated;
GRANT ALL ON public.cuotas_cobro,public.correos_automaticos TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.cuotas_cobro_id_seq TO service_role;
DROP POLICY IF EXISTS lectura_admin ON public.cuotas_cobro;
CREATE POLICY lectura_admin ON public.cuotas_cobro FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.administradores WHERE usuario_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS lectura_admin ON public.correos_automaticos;
CREATE POLICY lectura_admin ON public.correos_automaticos FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.administradores WHERE usuario_id=(SELECT auth.uid())));

REVOKE ALL ON FUNCTION public.generar_cuotas(date),public.preparar_aviso_pago(),public.vincular_pago_cuota(),public.preparar_avisos_atraso(),public.reclamar_correos(integer),public.confirmar_correo(uuid,uuid,text),public.fallar_correo(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generar_cuotas(date),public.preparar_avisos_atraso(),public.reclamar_correos(integer),public.confirmar_correo(uuid,uuid,text),public.fallar_correo(uuid,uuid,text,boolean) TO service_role;


-- El contenido exacto del proveedor se congela en el primer intento.
ALTER TABLE public.correos_automaticos ADD COLUMN IF NOT EXISTS solicitud_proveedor jsonb;
CREATE OR REPLACE FUNCTION public.validar_correo_envio(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.correos_automaticos; v_saldo bigint;
BEGIN
  SELECT * INTO c FROM public.correos_automaticos WHERE id=p_id AND token_bloqueo=p_token AND estado='enviando' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.tipo='atraso_7_dias' THEN
    SELECT saldo INTO v_saldo FROM public.saldos_cuotas WHERE id=c.cuota_id;
    IF v_saldo IS NULL OR v_saldo=0 THEN
      UPDATE public.correos_automaticos SET estado='cancelado' WHERE id=p_id;
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.congelar_solicitud_correo(p_id uuid,p_token uuid,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_solicitud jsonb;
BEGIN
  UPDATE public.correos_automaticos SET solicitud_proveedor=coalesce(solicitud_proveedor,p_solicitud)
  WHERE id=p_id AND token_bloqueo=p_token AND estado='enviando'
  RETURNING solicitud_proveedor INTO v_solicitud;
  RETURN v_solicitud;
END $$;
REVOKE ALL ON FUNCTION public.validar_correo_envio(uuid,uuid),public.congelar_solicitud_correo(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validar_correo_envio(uuid,uuid),public.congelar_solicitud_correo(uuid,uuid,jsonb) TO service_role;

COMMIT;
