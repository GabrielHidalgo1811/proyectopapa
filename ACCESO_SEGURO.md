# Acceso a Antonini

## Primera cuenta

El 3 de noviembre de 2026 se comprobó que Authentication no tenía usuarios en este proyecto. La cuenta del dashboard de Supabase no crea una cuenta de acceso a la aplicación.

1. En el proyecto de Supabase, abrir **Authentication → Users → Add user → Create new user**.
2. Crear `gabriel.hidalgo1@cloud.uautonoma.cl` con una contraseña propia. Confirmar el correo desde el dashboard si se usa la opción **Auto Confirm User**. No publicar la contraseña ni enviarla por el chat.
3. Ejecutar **solo** `database/08_autorizar_acceso.sql` en SQL Editor. El resultado debe incluir ese correo. Si se prefiere otro correo de acceso, editar la lista del script antes de ejecutarlo.
4. Recargar la aplicación e iniciar sesión. Para habilitar al cliente, crear su cuenta `tvxsiempre@gmail.com` y ejecutar el mismo SQL. No hay registro público de cuentas.

## Sesiones

- Sin **Mantener sesión**: seis horas absolutas desde el inicio de sesión. No se extienden al usar la web ni al renovar los tokens de Supabase. La cookie no es persistente; cerrar el navegador puede finalizarla antes.
- Con la opción marcada: hasta 30 días, incluso al cerrar el navegador. Cerrar sesión la revoca inmediatamente en este servidor.
- Supabase valida correo/contraseña y se verifica la pertenencia a `public.administradores` antes de acceder a los datos. Un usuario de Authentication sin autorización no puede entrar.
- El servidor protege `/api/state`, `/api/system`, `/api/alerts` y `/api/mail-status`. La pantalla de login no es el control de acceso: las API también rechazan solicitudes sin sesión.
- El navegador recibe una cookie HttpOnly y SameSite=Strict. No se guardan contraseñas ni tokens de Supabase en localStorage. Las sesiones se guardan en `data/auth-sessions.sqlite`, con los tokens cifrados mediante AES-256-GCM; la clave está en un archivo local separado, excluido de Git y del servidor de archivos.
- No borrar la base de sesiones ni su clave durante un reinicio normal. Si se retiran ambas deliberadamente, todos deberán iniciar sesión nuevamente.

## Recuperación

**Olvidé mi contraseña** genera un enlace de recuperación de Supabase para una cuenta autorizada y lo envía con Brevo usando la configuración local de `supabase/.env.local`. No requiere modificar el worker de comprobantes ni SQL de correos. La respuesta en pantalla no revela si una dirección tiene cuenta.

El enlace verifica un token de recuperación de un solo uso. Se abre un formulario para una contraseña nueva de 10 a 128 caracteres, con confirmación y botones para mostrar/ocultar. La sesión temporal de recuperación no puede leer los datos de la app. Al guardar, se invalidan todas las sesiones locales de esa cuenta y se vuelve al login. El enlace apunta a la dirección desde la que se solicitó; en desarrollo se debe abrir en el computador donde está funcionando localhost.

No se enviaron invitaciones ni correos de recuperación reales durante la implementación. Las pruebas utilizan usuarios y un proveedor de correo simulados.

## Verificación

`npm test`: 40 pruebas pasan, incluyendo la expiración exacta a las seis horas, duración de la sesión persistente, renovación de tokens, reinicio del servidor, revocación de permisos y recuperación de contraseña. También se revisó el flujo completo en un navegador de pruebas a 320, 390 y 1440 px. Capturas locales en `data/login-*.png`.

Archivos públicos sincronizados con `dist/`: `index.html`, `auth.js`, `app.js` y `style.css`. La autenticación se configura al iniciar `server.cjs` y no tiene un interruptor público para deshabilitarla.
