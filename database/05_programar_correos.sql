-- MIGRACION 05: ejecutar UNA VEZ despues de desplegar la Edge Function.
-- Antes, crear en Supabase Vault dos secretos:
-- antonini_project_url = URL del proyecto (https://...supabase.co)
-- antonini_worker_secret = MISMO valor que MAIL_WORKER_SECRET de la Edge Function.
-- No pegar la clave service_role ni la API de Brevo en este SQL ni en Git.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.despertar_procesador_correos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text; v_token text;
BEGIN
 SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='antonini_project_url' LIMIT 1;
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='antonini_worker_secret' LIMIT 1;
 IF v_url IS NULL OR v_token IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=v_url||'/functions/v1/hyper-handler',headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',v_token),body:='{}'::jsonb,timeout_milliseconds:=1000);
END $$;
REVOKE ALL ON FUNCTION public.despertar_procesador_correos() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.despertar_procesador_correos() TO service_role;

CREATE OR REPLACE FUNCTION public.despertar_correo_tras_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.despertar_procesador_correos();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.despertar_correo_tras_pago() FROM PUBLIC,anon,authenticated;
-- Orden alfabetico: este trigger corre despues de preparar_aviso_pago.
DROP TRIGGER IF EXISTS z_despertar_correo_tras_pago ON public.pagos;
CREATE TRIGGER z_despertar_correo_tras_pago AFTER INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.despertar_correo_tras_pago();

-- Un unico procesador global: cualquier nuevo arriendo/prestamo queda incluido.
DO $$
DECLARE trabajo record;
BEGIN
 FOR trabajo IN SELECT jobid FROM cron.job WHERE jobname='antonini-correos' LOOP
   PERFORM cron.unschedule(trabajo.jobid);
 END LOOP;
END $$;
SELECT cron.schedule('antonini-correos','*/2 * * * *','SELECT public.despertar_procesador_correos();');
-- Habilitar correo_habilitado desde Configuracion en la app solo al terminar las pruebas.
