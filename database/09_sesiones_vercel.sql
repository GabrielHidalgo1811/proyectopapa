-- Sesiones persistentes para Vercel. Ejecutar sobre el esquema existente.
-- No borra personas, habitaciones, prestamos ni pagos. No envia correos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sesiones_acceso(
 id_hash text PRIMARY KEY CHECK(id_hash ~ '^[a-f0-9]{64}$'),
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 correo text NOT NULL,tokens_cifrados text NOT NULL,
 token_expira_ms bigint NOT NULL,expira_ms bigint NOT NULL,
 recordar integer NOT NULL CHECK(recordar IN(0,1)),
 proposito text NOT NULL CHECK(proposito IN('app','recovery')),
 ticket uuid,renovando_hasta timestamptz
);
CREATE INDEX IF NOT EXISTS sesiones_acceso_usuario ON public.sesiones_acceso(usuario_id);
CREATE INDEX IF NOT EXISTS sesiones_acceso_expira ON public.sesiones_acceso(expira_ms);
ALTER TABLE public.sesiones_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sesiones_acceso FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sesiones_acceso TO service_role;

CREATE TABLE IF NOT EXISTS public.intentos_acceso(
 clave text PRIMARY KEY CHECK(length(clave)=64),inicio timestamptz NOT NULL,intentos integer NOT NULL
);
ALTER TABLE public.intentos_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intentos_acceso FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.intentos_acceso TO service_role;

CREATE OR REPLACE FUNCTION public.limitar_intentos_acceso(p_clave text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intentos integer;
BEGIN
 DELETE FROM public.intentos_acceso WHERE inicio<now()-interval '15 minutes';
 INSERT INTO public.intentos_acceso(clave,inicio,intentos) VALUES(p_clave,now(),1)
 ON CONFLICT(clave) DO UPDATE SET intentos=public.intentos_acceso.intentos+1
 RETURNING intentos INTO v_intentos;
 RETURN v_intentos<=12;
END $$;

CREATE OR REPLACE FUNCTION public.adquirir_renovacion_sesion(p_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ticket uuid;
BEGIN
 UPDATE public.sesiones_acceso SET ticket=gen_random_uuid(),renovando_hasta=now()+interval '30 seconds'
 WHERE id_hash=p_id AND expira_ms>extract(epoch FROM now())*1000
   AND token_expira_ms<=extract(epoch FROM now())*1000+60000
   AND (renovando_hasta IS NULL OR renovando_hasta<now())
 RETURNING ticket INTO v_ticket;
 RETURN v_ticket;
END $$;
REVOKE ALL ON FUNCTION public.limitar_intentos_acceso(text),public.adquirir_renovacion_sesion(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.limitar_intentos_acceso(text),public.adquirir_renovacion_sesion(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'Sesiones de Vercel listas' AS resultado;
