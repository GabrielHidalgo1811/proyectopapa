-- ANTONINI / CASA PAC - SUPABASE / POSTGRESQL
-- Ejecutar completo en SQL Editor > New query > Run.
-- ATENCION: elimina las tablas de Antonini enumeradas abajo y sus datos.
-- No elimina usuarios de Authentication, Storage ni tablas de otros proyectos.
-- Si se ejecuta otra vez, vuelve a dejar vacias las tablas de Antonini.
BEGIN;

-- 1. Eliminar el esquema anterior en ingles, respetando sus dependencias.
DROP TABLE IF EXISTS public.outbox;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.room_services;
DROP TABLE IF EXISTS public.person_roles;
DROP TABLE IF EXISTS public.loans;
DROP TABLE IF EXISTS public.rooms;
DROP TABLE IF EXISTS public.people;
DROP TABLE IF EXISTS public.settings;
DROP TABLE IF EXISTS public.metadata;
DROP TABLE IF EXISTS public.app_admins;

-- Permitir repetir este reinicio si ya existen las tablas en espanol.
DROP TABLE IF EXISTS public.borradores;
DROP TABLE IF EXISTS public.pagos;
DROP TABLE IF EXISTS public.equipamiento_habitacion;
DROP TABLE IF EXISTS public.roles_persona;
DROP TABLE IF EXISTS public.prestamos;
DROP TABLE IF EXISTS public.habitaciones;
DROP TABLE IF EXISTS public.personas;
DROP TABLE IF EXISTS public.configuracion;
DROP TABLE IF EXISTS public.metadatos;
DROP TABLE IF EXISTS public.administradores;

-- 2. PERSONAS: contactos compartidos entre inquilinos, deudores y avales.
-- Una persona se registra una sola vez y puede cumplir varios roles.
CREATE TABLE public.personas (
  id text PRIMARY KEY,
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  telefono text NOT NULL CHECK (length(trim(telefono)) > 0),
  correo text NOT NULL CHECK (length(trim(correo)) > 0)
);

-- Permite registrar un inquilino o aval aun sin asignarle habitacion o prestamo.
-- El rol de deudor se determina por los prestamos que tenga a su nombre.
CREATE TABLE public.roles_persona (
  persona_id text NOT NULL REFERENCES public.personas(id),
  rol text NOT NULL CHECK (rol IN ('inquilino', 'aval')),
  PRIMARY KEY (persona_id, rol)
);

-- 3. HABITACIONES: todas pertenecen a Casa PAC.
-- inquilino_id en NULL significa habitacion sin inquilino asignado.
-- Los avales NO se vinculan a las habitaciones.
CREATE TABLE public.habitaciones (
  id text PRIMARY KEY,
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  inmueble text NOT NULL DEFAULT 'Casa PAC' CHECK (inmueble = 'Casa PAC'),
  inquilino_id text REFERENCES public.personas(id),
  mensualidad bigint NOT NULL CHECK (mensualidad > 0),
  dia_vencimiento integer NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 28),
  deposito bigint NOT NULL DEFAULT 0 CHECK (deposito >= 0)
);

CREATE TABLE public.equipamiento_habitacion (
  habitacion_id text NOT NULL REFERENCES public.habitaciones(id),
  posicion integer NOT NULL CHECK (posicion >= 0),
  elemento text NOT NULL CHECK (length(trim(elemento)) > 0),
  descripcion text NOT NULL,
  PRIMARY KEY (habitacion_id, posicion)
);

-- 4. PRESTAMOS: deudor y aval son dos personas diferentes.
-- tasa_mensual es porcentaje; los montos estan en pesos chilenos enteros.
CREATE TABLE public.prestamos (
  id text PRIMARY KEY,
  deudor_id text NOT NULL REFERENCES public.personas(id),
  aval_id text NOT NULL REFERENCES public.personas(id),
  capital bigint NOT NULL CHECK (capital > 0),
  tasa_mensual numeric(7,4) NOT NULL CHECK (tasa_mensual BETWEEN 0 AND 100),
  cuota_mensual bigint NOT NULL CHECK (cuota_mensual > 0),
  dia_vencimiento integer NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 28),
  capitalista text NOT NULL CHECK (length(trim(capitalista)) > 0),
  CHECK (deudor_id <> aval_id),
  CHECK (cuota_mensual > capital * tasa_mensual / 100)
);

-- 5. PAGOS: cada registro abona a una habitacion O a un prestamo.
-- periodo: mes abonado en formato AAAA-MM; fecha_recepcion: dia del pago.
-- Para arriendos, interes = 0 y abono_capital = monto (convencion actual).
CREATE TABLE public.pagos (
  id text PRIMARY KEY,
  habitacion_id text REFERENCES public.habitaciones(id),
  prestamo_id text REFERENCES public.prestamos(id),
  periodo text NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  fecha_recepcion date NOT NULL,
  monto bigint NOT NULL CHECK (monto > 0),
  abono_capital bigint NOT NULL CHECK (abono_capital >= 0),
  interes bigint NOT NULL CHECK (interes >= 0),
  CHECK ((habitacion_id IS NOT NULL) <> (prestamo_id IS NOT NULL)),
  CHECK (monto = abono_capital + interes),
  CHECK (habitacion_id IS NULL OR interes = 0)
);

-- 6. BORRADORES: mensajes preparados; no se envian automaticamente.
CREATE TABLE public.borradores (
  id text PRIMARY KEY,
  posicion integer NOT NULL DEFAULT 0 CHECK (posicion >= 0),
  asunto text NOT NULL,
  destinatario text NOT NULL,
  mensaje text NOT NULL,
  fecha_creacion date NOT NULL DEFAULT current_date,
  habitacion_id text REFERENCES public.habitaciones(id),
  prestamo_id text REFERENCES public.prestamos(id),
  CHECK (habitacion_id IS NULL OR prestamo_id IS NULL)
);

-- 7. CONFIGURACION Y METADATOS: una fila tecnica en cada tabla.
CREATE TABLE public.configuracion (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  correo_administracion text NOT NULL DEFAULT '',
  telefono_administracion text NOT NULL DEFAULT '',
  intervalo_recordatorios integer NOT NULL DEFAULT 5 CHECK (intervalo_recordatorios IN (3, 5, 7)),
  correo_habilitado boolean NOT NULL DEFAULT false,
  whatsapp_habilitado boolean NOT NULL DEFAULT false
);
CREATE TABLE public.metadatos (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  version_esquema integer NOT NULL DEFAULT 1
);
INSERT INTO public.configuracion(id) VALUES (1);
INSERT INTO public.metadatos(id) VALUES (1);

CREATE INDEX habitaciones_inquilino_idx ON public.habitaciones(inquilino_id);
CREATE INDEX prestamos_deudor_idx ON public.prestamos(deudor_id);
CREATE INDEX prestamos_aval_idx ON public.prestamos(aval_id);
CREATE INDEX pagos_habitacion_periodo_idx ON public.pagos(habitacion_id, periodo);
CREATE INDEX pagos_prestamo_periodo_idx ON public.pagos(prestamo_id, periodo);
CREATE INDEX borradores_habitacion_idx ON public.borradores(habitacion_id);
CREATE INDEX borradores_prestamo_idx ON public.borradores(prestamo_id);

-- 8. ACCESO: usuarios de Supabase Auth autorizados como administradores.
-- auth.users es una tabla propia de Supabase: no se renombra ni se elimina.
CREATE TABLE public.administradores (
  usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.administradores FROM anon, authenticated;
GRANT SELECT ON TABLE public.administradores TO authenticated;
CREATE POLICY administrador_consulta_propia ON public.administradores
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DO $$
DECLARE nombre_tabla text;
BEGIN
  FOREACH nombre_tabla IN ARRAY ARRAY[
    'personas', 'roles_persona', 'habitaciones', 'equipamiento_habitacion',
    'prestamos', 'pagos', 'borradores', 'configuracion', 'metadatos'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', nombre_tabla);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', nombre_tabla);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', nombre_tabla);
    EXECUTE format(
      'CREATE POLICY acceso_administradores ON public.%I FOR ALL TO authenticated
       USING (EXISTS (SELECT 1 FROM public.administradores WHERE usuario_id = (SELECT auth.uid())))
       WITH CHECK (EXISTS (SELECT 1 FROM public.administradores WHERE usuario_id = (SELECT auth.uid())))',
      nombre_tabla
    );
  END LOOP;
END $$;

-- Desde la API, un pago registrado solo puede consultarse o agregarse.
REVOKE UPDATE ON TABLE public.pagos FROM authenticated;
COMMIT;

-- PASO POSTERIOR: autorizar tu usuario (no ejecutar hasta sustituir el correo).
-- Crear primero el usuario en Authentication > Users.
-- Ejecutar aparte, quitando los guiones:
-- INSERT INTO public.administradores(usuario_id)
-- SELECT id FROM auth.users WHERE lower(email) = lower('TU_CORREO_AQUI')
-- ON CONFLICT (usuario_id) DO NOTHING;
-- SELECT usuario_id FROM public.administradores;
