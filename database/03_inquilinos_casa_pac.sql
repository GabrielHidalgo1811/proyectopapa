-- MIGRACION 03: contactos y habitaciones de la planilla proporcionada.
-- Ejecutar despues de 02_correos_automaticos.sql. No borra registros.
-- Montos confirmados por el usuario: 170 = $170.000 CLP.
-- Dia de pago, inicio de cobro, telefonos y correos: PENDIENTES, no inventados.
BEGIN;
ALTER TABLE public.habitaciones ALTER COLUMN dia_vencimiento DROP NOT NULL;
ALTER TABLE public.habitaciones ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible';
UPDATE public.habitaciones SET estado='ocupada' WHERE inquilino_id IS NOT NULL AND estado='disponible';

INSERT INTO public.personas(id,nombre,telefono,correo) VALUES
  ('C-PAC-01','Yoiber Perez',NULL,NULL),
  ('C-PAC-02','Britney',NULL,NULL),
  ('C-PAC-03','Roger Serna',NULL,NULL),
  ('C-PAC-04','Laura Contreras',NULL,NULL),
  ('C-PAC-05','Javier Sepulveda',NULL,NULL),
  ('C-PAC-06','Jeff Fleurancin',NULL,NULL),
  ('C-PAC-07','Jose David',NULL,NULL),
  ('C-PAC-08','Massinio Pierre',NULL,NULL),
  ('C-PAC-09','Duvelis',NULL,NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.roles_persona(persona_id,rol)
SELECT id,'inquilino' FROM public.personas WHERE id IN ('C-PAC-01','C-PAC-02','C-PAC-03','C-PAC-04','C-PAC-05','C-PAC-06','C-PAC-07','C-PAC-08','C-PAC-09')
ON CONFLICT DO NOTHING;

INSERT INTO public.habitaciones(id,nombre,inmueble,inquilino_id,mensualidad,dia_vencimiento,fecha_inicio,estado) VALUES
  ('I-PAC-01','Habitación 01','Casa PAC','C-PAC-01',170000,NULL,NULL,'ocupada'),
  ('I-PAC-02','Habitación 02','Casa PAC','C-PAC-02',200000,NULL,NULL,'ocupada'),
  ('I-PAC-03','Habitación 03','Casa PAC','C-PAC-03',190000,NULL,NULL,'ocupada'),
  ('I-PAC-04','Habitación 04','Casa PAC','C-PAC-04',180000,NULL,NULL,'ocupada'),
  ('I-PAC-05','Habitación 05','Casa PAC','C-PAC-05',160000,NULL,NULL,'ocupada'),
  ('I-PAC-06','Habitación 06','Casa PAC','C-PAC-06',160000,NULL,NULL,'ocupada'),
  ('I-PAC-07','Anexo 07','Casa PAC','C-PAC-07',260000,NULL,NULL,'ocupada'),
  ('I-PAC-08','Habitación 08','Casa PAC','C-PAC-08',230000,NULL,NULL,'ocupada'),
  ('I-PAC-09','Habitación 09','Casa PAC','C-PAC-09',210000,NULL,NULL,'ocupada'),
  ('I-PAC-10','Habitación 10','Casa PAC',NULL,230000,NULL,NULL,'en_construccion'),
  ('I-PAC-11','Habitación 11','Casa PAC',NULL,230000,NULL,NULL,'en_construccion'),
  ('I-PAC-12','Anexo 12','Casa PAC',NULL,240000,NULL,NULL,'disponible')
ON CONFLICT (id) DO NOTHING;

UPDATE public.configuracion SET correo_administracion='tvxsiempre@gmail.com' WHERE id=1 AND correo_administracion='';
UPDATE public.configuracion SET telefono_administracion='+56 9 6725 1612' WHERE id=1 AND telefono_administracion='';
COMMIT;

-- Comprobacion: 12 habitaciones, $2.460.000 de mensualidad nominal total.
SELECT nombre,mensualidad,estado,dia_vencimiento,fecha_inicio FROM public.habitaciones ORDER BY id;
-- No se importan los pagos historicos: faltan anio/fecha exacta de recepcion.
-- Tampoco se cargan prestamos: faltan avales y condiciones confirmadas.
