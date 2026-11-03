-- Ejecutar en Supabase > SQL Editor, sobre la base existente.
-- Confirmacion: habitacion 10 en construccion, mensualidad referencial $230.000.
-- El resto del listado conserva sus datos actuales hasta confirmar las diferencias.
-- No carga pagos historicos, no crea cuotas y no envia correos.
BEGIN;
SELECT id FROM public.metadatos WHERE id=1 FOR UPDATE;

INSERT INTO public.habitaciones(id,nombre,inmueble,inquilino_id,mensualidad,dia_vencimiento,fecha_inicio,estado)
VALUES('I-PAC-10','Habitación 10','Casa PAC',NULL,230000,NULL,NULL,'en_construccion')
ON CONFLICT(id) DO NOTHING;

DO $$
BEGIN
  PERFORM id FROM public.habitaciones WHERE id='I-PAC-10' FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.habitaciones WHERE id='I-PAC-10' AND inquilino_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.pagos WHERE habitacion_id='I-PAC-10')
    OR EXISTS(SELECT 1 FROM public.cuotas_cobro WHERE habitacion_id='I-PAC-10') THEN
    RAISE EXCEPTION 'La habitacion 10 ya tiene inquilino, cuotas o pagos. No se modifico: revisar antes de cambiar su estado.';
  END IF;
END $$;

UPDATE public.habitaciones SET mensualidad=230000,estado='en_construccion',
  dia_vencimiento=NULL,fecha_inicio=NULL,fecha_fin=NULL
WHERE id='I-PAC-10';
-- Evita que una pestaña antigua de la app sobreescriba el cambio.
UPDATE public.metadatos SET revision=revision+1 WHERE id=1;
COMMIT;

-- Este resultado muestra lo que aparecera en Arriendos al recargar la web.
SELECT h.nombre AS habitacion,h.inmueble,coalesce(p.nombre,'Sin inquilino') AS inquilino,
  h.mensualidad,h.estado,h.dia_vencimiento,h.fecha_inicio
FROM public.habitaciones h LEFT JOIN public.personas p ON p.id=h.inquilino_id
ORDER BY h.id;

SELECT (SELECT count(*) FROM public.habitaciones) AS habitaciones,
  (SELECT count(*) FROM public.personas) AS personas,
  (SELECT count(*) FROM public.pagos) AS pagos_registrados;
