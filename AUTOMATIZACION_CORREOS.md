# Correos automáticos de Antonini

## Nombres y abonos confirmados el 3 de noviembre de 2026 (ultima revision)

Los asuntos, remitentes, cabeceras y pies usan **Antonini Casa PAC 4009** para arriendos y **Antonini Inversiones** para prestamos. Esta revision reemplaza los nombres anteriores; no cambia el inmueble de la base de datos.

Se verifico en PostgreSQL de pruebas una mensualidad de $190.000: un abono de $120.000 deja saldo $70.000; el segundo de $70.000 deja saldo cero y total mensual $190.000. Se crean los dos comprobantes de cliente/administrador por abono. No permite superar el saldo. El correo distingue monto del ultimo pago, total pagado del mes y estado de ese mes. Para acumular correctamente, registrar ambos pagos en la misma habitacion y periodo.

Se enviaron a `gabrielhidalgo1811@gmail.com` cuatro ejemplos con formato oficial, sin banner ni asunto PRUEBA: primer abono de $120.000, segundo de $70.000 con mes pagado, aviso de saldo pendiente de $70.000 y recordatorio de prestamo. Brevo acepto los cuatro; son ejemplos solicitados, sin insertar pagos ni modificar saldos reales. Confirmaciones en `data/pruebas-oficial-20261103/`. No reenviar sin revisar esos registros. El modo `--official --batch=...` prepara estos ejemplos; los fixtures internos ordinarios conservan su etiqueta de prueba.

Activacion: volver a desplegar `supabase/enviar-correos-editor.ts` en **hyper-handler**. No se necesita SQL nuevo; requiere la ampliacion 06 ya aplicada para el detalle mensual acumulado. Los comprobantes reales ya omiten el banner de prueba porque sus eventos no tienen `es_prueba=true`.

## Formato solicitado el 3 de noviembre de 2026 (vigente)

- Habitaciones: asunto, nombre del remitente y pie usan **Antonini • Subercaseaux**. Se identifica la habitación en la cabecera y el asunto. No se renombra el inmueble ni se cambian datos en la base de datos.
- Confirmación de arriendo: diseño original, saludo «Hola», monto recibido y detalle del pago, sin historial mensual. Un abono parcial conserva el saldo pendiente.
- Recordatorio de arriendo: mismo estilo, monto pendiente destacado y habitación/período/vencimiento en texto, sin tabla de datos ni historial.
- Préstamos: asunto, nombre del remitente y pie usan **AntoninI • Prestame ya!!!**, con la capitalización y texto solicitados. Se conserva el diseño, logo, detalles e historial.
- El historial sigue guardándose en los eventos para los cálculos y para préstamos; solo se oculta en los correos de habitaciones.
- Código y archivo de editor regenerados. Para activar este formato, reemplazar el código de la función **hyper-handler** con `supabase/enviar-correos-editor.ts` y pulsar Deploy updates. No ejecutar SQL.
- Verificación: 31 pruebas pasan; tres diseños revisados a 390 y 900 píxeles. Vistas locales en `data/pruebas-textos-v3/nov03-*.png`. No se enviaron correos nuevos para esta modificación.

Las notas de diseño anteriores se conservan como historial y quedan reemplazadas por esta sección cuando difieren.

## Tres pruebas con los textos solicitados

Brevo aceptó tres pruebas dirigidas únicamente a `gabrielhidalgo1811@gmail.com`: préstamo pendiente de $140.000, abono de arriendo de $120.000 con saldo $50.000 y alerta de arriendo sin pago por $170.000. Todos son ejemplos de octubre de 2026, marcados PRUEBA; no se guardaron personas, cuotas ni pagos. Las confirmaciones se conservan en `data/pruebas-textos-v3/` para evitar duplicados. El envío directo verifica los mensajes y la aceptación del proveedor, no el flujo completo de la aplicación.

Se actualizó el saludo a «Estimado…», el período en español y el texto de contacto de los avisos. Si ya existe un abono, el aviso informa el abono y saldo restante en lugar de afirmar que no se recibió ningún pago. Para aplicar esta última redacción en los correos automáticos, volver a desplegar `supabase/enviar-correos-editor.ts` en la función existente `hyper-handler`. No hace falta repetir SQL por este cambio de textos.

## Historial de seis meses y cabecera aprobada

- Ejecutar únicamente `database/06_historial_correos.sql` en SQL Editor para instalar la ampliación; no ejecutar el reinicio del esquema. El script no borra pagos ni envía correos. Se verificó con PostgreSQL local de pruebas.
- Reemplazar todo el código de la función **hyper-handler** por `supabase/enviar-correos-editor.ts` y desplegar. Conservar los Secrets y la verificación JWT desactivada porque la función verifica `x-worker-secret`.
- El logo original está en `assets/antonini-prestamos.png`, publicado y verificado en el objeto público `correos/antonini-prestamos.png` de Supabase Storage. Solo se usa en préstamos. Nunca guardar información privada de inquilinos en ese espacio público.
- Tanto el comprobante de arriendo como el aviso de atraso identifican arriba y en el asunto **Casa PAC - Habitación XX**, o el nombre de Anexo correspondiente.
- El historial cubre el mes del pago y los cinco anteriores. Solo incluye cuotas registradas del mismo contrato y persona; no inventa meses anteriores al inicio confirmado. Si faltan pagos históricos, deben cargarse con sus fechas y montos reales.
- Sin abonos: **Pendiente**, con guiones en los importes recibidos. Con abonos insuficientes: **Pago parcial** y saldo. Saldo cero: **Pagado**. Se acumulan todos los abonos de cada cuota; no se muestra total acumulado de arriendos.
- En préstamos se distinguen capital al inicio del período, intereses pagados, abono a capital, pago recibido, saldo de cuota y capital pendiente. No se muestran proyecciones como pagos reales. Se usa la última fecha si hubo varios abonos en el mes.
- Los comprobantes guardan una fotografía al generarse; los avisos de atraso actualizan el saldo e historial antes del primer intento. Los envíos anteriores no se reenvían.
- Vistas locales: `data/vista-correos/arriendo.html`, `atraso.html`, `prestamo.html`. Regenerar con `node scripts/preview-historial.mjs`; no envía correos.

## Prueba de diseño del 26 de octubre de 2026

Se enviaron dos mensajes separados con datos ficticios y asunto `[PRUEBA] Pago actualizado`: a Gabriel Hidalgo (`gabrielhidalgo1811@gmail.com`) y a administración (`tvxsiempre@gmail.com`). Brevo aceptó ambos mensajes; la recepción se debe comprobar en entrada o spam. No se crearon personas, contratos ni pagos en la base de datos. Los comprobantes locales del envío están en `data/prueba-correo-gabriel/`, carpeta excluida de Git.

El nuevo diseño está en el renderizador local y en `supabase/enviar-correos-editor.ts`. Para utilizarlo en los pagos reales, falta reemplazar el código de la función remota existente **hyper-handler** por ese archivo y volver a desplegarla. Esta prueba envió directamente por Brevo: no verifica el recorrido completo de registrar un pago desde la web. No ejecutar la prueba otra vez sin revisar los registros de envío; el script bloquea repeticiones.

## Resultado preparado

- Al confirmar un pago de arriendo o préstamo, la misma transacción crea dos notificaciones: una para el cliente y otra para administración.
- El envío falla de forma independiente al pago: nunca hay que registrar otra vez un pago porque un correo falló.
- Se crean cuotas mensuales desde la fecha de inicio confirmada. A los siete días de vencimiento, si existe saldo, aparece la advertencia web y se crea un aviso por destinatario y cuota.
- El aviso se genera una vez por cuota. No se insiste cada dos minutos ni se cobra dos veces. Los períodos anteriores conservan su saldo aunque cambie el mes.
- No se notifican avales automáticamente: los destinatarios son el deudor/inquilino y el administrador.
- Si falta correo, la notificación queda pendiente. Al completar el contacto en Personas, se puede procesar sin registrar nada fuera de la app.
- Si el pago se recibe antes de enviar el aviso de atraso, el procesador lo cancela. Puede existir una carrera normal si el correo ya se está enviando justo al pagar.

## Datos confirmados de Casa PAC

`database/03_inquilinos_casa_pac.sql` carga 12 habitaciones y 9 inquilinos. Habitación 10 y 11 están en construcción; Anexo 12 está disponible. Mensualidad nominal de las 12 habitaciones: $2.460.000. Esta suma incluye unidades desocupadas y en construcción; no representa ingresos efectivos.

Nombre corregido: Roger Serna. Administrador: tvxsiempre@gmail.com. WhatsApp: +56 9 6725 1612.

Teléfonos/correos de inquilinos, día de pago y fecha de inicio se dejan pendientes. Sin calendario confirmado no se crean cuotas ni recordatorios. No se importan los pagos históricos porque faltan años y fechas de recepción. No se importan los préstamos de las otras imágenes: hay diferencias entre capital, intereses, cuotas y anotaciones que necesitan validación.

## Proveedor gratuito

Se preparó Brevo por HTTPS: 300 envíos diarios en su plan gratuito al revisar el 26 de octubre de 2026. Una copia al cliente y otra al administrador cuentan como dos envíos. Hay que crear y validar la cuenta de envío una sola vez; los destinatarios no necesitan cuentas en Brevo.

Con remitente Gmail, Brevo puede sustituir la dirección visible por una compatible de su servicio. `Reply-To` mantiene las respuestas hacia tvxsiempre@gmail.com. Verificar el remitente y la habilitación de correos transaccionales en Brevo antes de activar el sistema. El plan gratuito puede incluir su marca.

También se preparó un adaptador de Resend: 3.000 envíos mensuales, hasta 100 diarios. Requiere dominio propio verificado para enviar a clientes. No es necesario usar los dos proveedores.

Fuentes:
- https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://resend.com/docs/dashboard/domains/introduction

## Activación, una sola vez

1. Si ya ejecutaste el esquema en español, **NO vuelvas a ejecutar `database/supabase.sql`**, porque es el reinicio destructivo. Ejecutar en SQL Editor, en este orden:
   - `database/02_correos_automaticos.sql`.
   - `database/03_inquilinos_casa_pac.sql`.
   - `database/04_conectar_aplicacion.sql`.
2. En `.env.local` de la raíz, completar `SUPABASE_SERVICE_ROLE_KEY` con la clave privada de servicio del proyecto y cambiar `ANTONINI_STORAGE=supabase`. La clave publishable existente no tiene permiso para estas operaciones de servidor. No subir el archivo a Git ni copiar claves privadas al JavaScript público. Reiniciar `npm start`. La interfaz sigue siendo de uso local y confiable, sin autenticación web: no publicar este servidor en Internet sin incorporar acceso de usuarios.
3. Crear/verificar el remitente de Brevo y completar `BREVO_API_KEY` en `supabase/.env.local`. El archivo ya tiene proveedor Brevo, remitente, respuesta, WhatsApp y un secreto aleatorio de acceso al procesador. Este archivo también está excluido de Git. Las API de Brevo/Resend nunca van al navegador.
4. Desplegar la función desde esta carpeta:

```sh
npx supabase login
npx supabase link --project-ref vgpsbveqoibblijyawrn
npx supabase secrets set --env-file supabase/.env.local
npx supabase functions deploy enviar-correos --no-verify-jwt --use-api
```

La función requiere el encabezado privado `x-worker-secret`. Aunque se desactive la verificación JWT del gateway, no queda abierta: valida `MAIL_WORKER_SECRET` antes de hacer cualquier consulta o envío. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de la función los proporciona el entorno Supabase.

5. En Supabase Vault, crear:
   - `antonini_project_url`: URL del proyecto.
   - `antonini_worker_secret`: el mismo valor privado de `MAIL_WORKER_SECRET` del archivo de la función.
6. Ejecutar `database/05_programar_correos.sql`. Invoca el procesador después de registrar un pago y también cada dos minutos. El cron es global y sirve para cualquier nuevo contrato; no se configura uno por inquilino. Funciona sin el navegador o computador local abiertos mientras el proyecto Supabase esté activo. El plan y disponibilidad de Supabase se administran por separado del proveedor de correo.
7. En la app, completar contactos y confirmar calendario por habitación/préstamo. Activar «Habilitar correos automáticos» en Configuración después de verificar el remitente. El script de importación deja esa opción desactivada.

**Estado actual:** todo lo anterior está preparado y probado localmente; no se han ejecutado las migraciones en el proyecto remoto, desplegado la función ni enviado correos reales. Faltan las claves privadas del servidor y del proveedor, y los calendarios/contactos que se confirmarán con el cliente.

## Plantilla provisional

El contenido se encuentra en `supabase/functions/_shared/mail.mjs`, función `renderEmail`. Se puede sustituir por el diseño final sin cambiar la lógica de pagos, destinatarios o programación. Incluye versiones HTML y texto.

Aviso: «Hola, [nombre]. Pasó la fecha de tu pago de [concepto], correspondiente a [período]. Si ya lo realizaste, por favor envía el comprobante por WhatsApp al +56 9 6725 1612».

Las solicitudes de correo se congelan en su primer intento: cambiar el diseño no altera un correo que se está reintentando.

## Estado y reintentos

- `pendiente`: espera envío, configuración o un dato de contacto.
- `enviando`: un trabajador reservó el correo; otros trabajadores no lo toman.
- `aceptado`: el proveedor confirmó la solicitud. No significa que el destinatario lo haya leído ni garantiza entrega en su bandeja. No se implementaron webhooks de entrega o rebote todavía.
- `revision`: verificar el resultado en el proveedor antes de reintentar manualmente.
- `cancelado`: el aviso ya no corresponde porque se pagó.

Los eventos tienen clave única y se reservan con bloqueo de filas. Resend reutiliza la misma clave de idempotencia durante su ventana de 24 horas; fuera de 23 horas se solicita revisión. En Brevo, una respuesta incierta o una interrupción del procesador requiere revisión, para evitar reenvíos duplicados. Un rechazo claro por límite de solicitudes puede reintentarse. No se promete entrega exactamente una vez ante una caída de red.

## Pruebas

`npm test` verifica SQLite, las migraciones PostgreSQL con PGlite, la importación, pagos/colas, límite de siete días, cancelación, permisos y plantillas/proveedores con respuestas simuladas. Ninguna prueba envía mensajes reales ni modifica Supabase remoto.
