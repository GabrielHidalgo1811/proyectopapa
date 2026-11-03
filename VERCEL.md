# Publicar Antonini en Vercel

## Configuración del proyecto

Repositorio: `GabrielHidalgo1811/proyectopapa`. Rama: `main`. Root Directory: raíz del repositorio. Framework: **Other**. Node.js: **24.x**. El archivo `vercel.json` configura `npm run build` y la carpeta pública `dist`.

Las diez rutas de API están en `api/`: sesiones, login, logout, recuperación, nueva contraseña, datos, estado del sistema, alertas y correos. Se publican como funciones de Node y no como archivos estáticos. `dist` contiene únicamente HTML, CSS, JavaScript del navegador y la imagen pública.

## Variables en Vercel (Production)

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada, **Sensitive** |
| `ANTONINI_STORAGE` | `supabase` |
| `BREVO_API_KEY` | Clave privada de Brevo, **Sensitive** |
| `MAIL_FROM` | Remitente verificado en Brevo |
| `MAIL_REPLY_TO` | Dirección de respuesta de administración |

Las demás variables pueden ser configuración normal. Marcar una variable como Sensitive no cambia su nombre ni su disponibilidad para el servidor. Después de cambiar variables se necesita un nuevo despliegue.

El dominio actual `https://proyectopapa.vercel.app` está autorizado. Los dominios de deployment y producción se obtienen también de `VERCEL_URL` y `VERCEL_PROJECT_PRODUCTION_URL`. Para un dominio propio distinto puede configurarse `APP_URL=https://...`. Solo se aceptan orígenes HTTPS de esa lista; no se confía en un Host arbitrario ni en headers de protocolo enviados por el cliente.

## Supabase

1. En una base existente, aplicar **solo** `database/09_sesiones_vercel.sql`. No ejecutar el reinicio `supabase.sql`.
2. Deben existir las cuentas en **Authentication → Users** y estar autorizadas en `public.administradores`; ver `database/08_autorizar_acceso.sql` y `ACCESO_SEGURO.md`.
3. El SQL 09 crea `sesiones_acceso` e `intentos_acceso`, con RLS y acceso exclusivo del servidor por service_role. Las sesiones guardan tokens cifrados y hash de la cookie, no contraseñas. También incorpora exclusión para renovar tokens sin carreras entre funciones y un límite de intentos compartido.
4. La clave de cifrado se deriva de la clave privada de Supabase y la URL del proyecto mediante HKDF-SHA256, con contexto exclusivo de sesiones. No hace falta otra variable ni un archivo de claves en Vercel. Rotar la clave privada invalida las sesiones existentes; los usuarios deberán entrar de nuevo.

## Sesiones y correo

El funcionamiento conserva seis horas absolutas sin Mantener sesión y hasta 30 días al marcarlo. La expiración se comprueba en el servidor. En Vercel las sesiones permanecen en Supabase al cambiar de instancia; no usan SQLite ni `/tmp`. La cookie es HttpOnly, Secure y SameSite=Strict.

La recuperación envía por Brevo un enlace HTTPS del dominio desde el que se solicitó. El token se verifica una sola vez en Supabase. La sesión temporal solo permite cambiar la contraseña; al guardarla se invalidan todas las sesiones de la cuenta. Los correos de cobranza siguen en la función de Supabase y conservan sus Secrets, independientes de estas funciones de Vercel.

## Desplegar y comprobar

Aplicar el SQL 09 y desplegar el commit actualizado de main (o **Deployments → Redeploy**). Revisar que el despliegue haya finalizado como Ready y que no haya overrides antiguos para Build/Output Directory.

`GET https://proyectopapa.vercel.app/api/auth/session` sin cookie debe responder **401 con JSON**, no 404 ni una página HTML. Después, probar el login con una cuenta autorizada. Una contraseña incorrecta produce un mensaje claro; no se toma el 404 de una ruta inexistente como error de contraseña.

La validación local cubre las rutas de Node, lectura de JSON ya procesado por Vercel, varias instancias compartiendo sesiones, renovación concurrente, revocación, permisos de tablas y cookies HTTPS. Una simulación local no sustituye la comprobación del deployment real.
