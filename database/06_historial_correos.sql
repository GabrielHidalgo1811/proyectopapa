-- Ejecutar DESPUES de 02, 03, 04 y 05. No borra registros ni envia correos.
-- Conserva una fotografia del historial al generar cada notificacion.
BEGIN;
CREATE OR REPLACE FUNCTION public.detalle_correo_contrato(p_cuota bigint,p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cuotas_cobro; h public.habitaciones; l public.prestamos;
  v_historial jsonb; v_resultado jsonb; v_capital bigint;
BEGIN
  SELECT * INTO c FROM public.cuotas_cobro WHERE id=p_cuota;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO h FROM public.habitaciones WHERE id=c.habitacion_id;
  SELECT * INTO l FROM public.prestamos WHERE id=c.prestamo_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'periodo',to_char(q.periodo,'YYYY-MM'),'vencimiento',q.fecha_vencimiento,
    'fecha',a.fecha,'mensualidad',q.monto,'pagado',a.pagado,
    'saldo',greatest(0,q.monto-a.pagado),'capital',a.capital,'interes',a.interes,
    'capital_antes',CASE WHEN c.prestamo_id IS NOT NULL THEN greatest(0,l.capital-(
      SELECT coalesce(sum(p.abono_capital),0) FROM public.pagos p
      WHERE p.prestamo_id=c.prestamo_id AND p.periodo<to_char(q.periodo,'YYYY-MM') AND p.fecha_recepcion<=p_fecha
    )) ELSE NULL END
  ) ORDER BY q.periodo),'[]'::jsonb) INTO v_historial
  FROM public.cuotas_cobro q
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(p.monto),0)::bigint pagado,coalesce(sum(p.abono_capital),0)::bigint capital,
      coalesce(sum(p.interes),0)::bigint interes,max(p.fecha_recepcion) fecha
    FROM public.pagos p WHERE p.cuota_id=q.id AND p.fecha_recepcion<=p_fecha
  ) a
  WHERE (q.habitacion_id=c.habitacion_id OR q.prestamo_id=c.prestamo_id)
    AND q.persona_id=c.persona_id
    AND q.periodo BETWEEN (date_trunc('month',p_fecha)-interval '5 months')::date AND date_trunc('month',p_fecha)::date;
  v_resultado=jsonb_build_object('tipo_contrato',CASE WHEN c.habitacion_id IS NOT NULL THEN 'arriendo' ELSE 'prestamo' END,
    'historial',v_historial,'historial_desde',to_char(date_trunc('month',p_fecha)-interval '5 months','YYYY-MM'),
    'historial_hasta',to_char(p_fecha,'YYYY-MM'));
  IF c.habitacion_id IS NOT NULL THEN
    RETURN v_resultado||jsonb_build_object('habitacion',h.nombre,'inmueble','Casa PAC');
  END IF;
  SELECT coalesce(sum(abono_capital),0) INTO v_capital FROM public.pagos WHERE prestamo_id=c.prestamo_id AND fecha_recepcion<=p_fecha;
  RETURN v_resultado||jsonb_build_object('capital_inicial',l.capital,'tasa_mensual',l.tasa_mensual,
    'abonos_capital',v_capital,'saldo_capital',greatest(0,l.capital-v_capital));
END $$;

CREATE OR REPLACE FUNCTION public.enriquecer_correo_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  NEW.datos=NEW.datos||public.detalle_correo_contrato(NEW.cuota_id,
    coalesce((NEW.datos->>'fecha')::date,(now() AT TIME ZONE 'America/Santiago')::date));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enriquecer_correo_historial ON public.correos_automaticos;
CREATE TRIGGER enriquecer_correo_historial BEFORE INSERT ON public.correos_automaticos
  FOR EACH ROW EXECUTE FUNCTION public.enriquecer_correo_historial();

-- Los avisos pendientes refrescan el historial junto con el saldo, antes del primer intento.
CREATE OR REPLACE FUNCTION public.refrescar_historial_aviso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.tipo='atraso_7_dias' AND NEW.estado='pendiente' AND NEW.primer_intento IS NULL AND NEW.solicitud_proveedor IS NULL THEN
    NEW.datos=NEW.datos||public.detalle_correo_contrato(NEW.cuota_id,(now() AT TIME ZONE 'America/Santiago')::date);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS refrescar_historial_aviso ON public.correos_automaticos;
CREATE TRIGGER refrescar_historial_aviso BEFORE UPDATE OF datos ON public.correos_automaticos
  FOR EACH ROW EXECUTE FUNCTION public.refrescar_historial_aviso();
REVOKE ALL ON FUNCTION public.detalle_correo_contrato(bigint,date),public.enriquecer_correo_historial(),public.refrescar_historial_aviso() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.detalle_correo_contrato(bigint,date) TO service_role;
COMMIT;
