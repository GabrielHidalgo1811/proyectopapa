# Antonini · Gestión de cobros

Aplicación para administrar habitaciones de Casa PAC, inquilinos, préstamos, avales y pagos. Incluye login con Supabase Authentication, sesiones privadas en el servidor y almacenamiento en Supabase o SQLite. No se crean pagos de demostración automáticamente.

## Ejecutar

Requiere Node.js 24 o superior. Configurar `.env.local` con las variables de `.env.example` y crear/autorizar las cuentas según `ACCESO_SEGURO.md` antes de iniciar sesión. El servidor usa módulos nativos; las pruebas usan PGlite como dependencia de desarrollo.

```sh
npm start
```

Abrir http://127.0.0.1:4173. En modo SQLite se crean automáticamente las tablas de `database/schema.sql` y el archivo `data/antonini.sqlite`. En modo Supabase se usa el esquema remoto previamente configurado. Reiniciar conserva los datos y las sesiones del servidor. No se importan los antiguos registros de demostración del navegador.

La aplicación necesita el servidor. Abrir el HTML directamente o publicar únicamente `dist/` no proporciona la API ni la base de datos. La configuración de hosting estático existente no ejecuta `server.cjs`; una publicación funcional necesita servidor y almacenamiento persistente.

Variables opcionales: `PORT` (4173 por defecto) y `ANTONINI_DB_PATH` (otro archivo SQLite). El servidor escucha únicamente en este computador.

## Tablas

| Tabla | Registros |
| --- | --- |
| `people` | Nombre, teléfono y correo |
| `person_roles` | Roles de inquilino y aval |
| `rooms` | Habitaciones de Casa PAC, inquilino, mensualidad, vencimiento y depósito |
| `room_services` | Equipamiento de cada habitación |
| `loans` | Deudor, aval, capital, tasa, cuota, vencimiento y capitalista |
| `payments` | Período, fecha, importe, capital e interés de cada abono |
| `outbox` | Borradores de recordatorios y comprobantes |
| `settings` | Contacto y preferencias de administración |
| `metadata` | Versión del esquema y revisión de los datos |

Solo se inicializan las filas técnicas de configuración y revisión. No se crean contactos ni datos de negocio. El aval se vincula únicamente a préstamos.

## Guardado y respaldo

La API `GET /api/state` consulta el estado. `PUT /api/state` guarda una revisión completa en una transacción. El servidor valida referencias, importes, cuotas y desglose de pagos. Rechaza guardados de sesiones desactualizadas, eliminaciones y modificaciones de pagos registrados. Si falla el guardado, el formulario permanece abierto y la aplicación recupera el último estado confirmado.

Para respaldar: detener el servidor y copiar `data/antonini.sqlite`. No borrar ese archivo para actualizar el código. La carpeta de datos está excluida de Git y el servidor no la publica por HTTP.

## Variables de Supabase

Las variables proporcionadas están en `.env.local`, excluido de Git junto con los demás archivos `.env`. `.env.example` contiene sus nombres sin valores. No copiar los valores a los archivos públicos ni a `dist/`.

El servidor permite elegir SQLite local o Supabase mediante `ANTONINI_STORAGE`. La autenticación usa Supabase en ambos modos y requiere la URL, clave pública y clave privada de servicio. Para guardar los datos de negocio en Supabase se necesitan además las migraciones descritas en `AUTOMATIZACION_CORREOS.md`. Las claves no están incluidas en este repositorio.

Para reemplazar las tablas remotas por el esquema en español, copiar `database/supabase.sql` completo al SQL Editor de Supabase y ejecutarlo. **Este script elimina las tablas de Antonini enumeradas y sus datos antes de recrearlas**; no elimina usuarios de Authentication. Es PostgreSQL, distinto del esquema local de SQLite. Incluye RLS y una lista de administradores autorizados; al final están las instrucciones para autorizar un usuario creado en Authentication. No incluye datos de ejemplo ni conecta automáticamente la interfaz a Supabase. Ver `database/FLUJO_SUPABASE.md` para entender las relaciones y el orden de registro.

## Interfaz

Diseño adaptable con navegación inferior en teléfonos, registros en tarjetas y formularios en una columna. Nueva habitación permite registrar un inquilino. Nuevo préstamo permite registrar su aval. Ambos guardan nombre, teléfono y correo.

Mantener sincronizadas las copias de `index.html`, `style.css`, `app.js`, `auth.js` y los recursos públicos en `dist/`.

## Pruebas

```sh
npm test
```

Usan bases temporales independientes para verificar arranque vacío, persistencia tras reinicio, integridad, pagos, concurrencia y API HTTP. No insertan datos en la base de uso real.

Las pruebas de PostgreSQL usan PGlite como dependencia de desarrollo (`npm install` antes de ejecutar las pruebas). Incluyen migraciones, carga de Casa PAC, permisos, cuotas y colas de correo. Las pruebas de proveedores usan respuestas simuladas: no envían correos reales.

## Automatización y carga de Casa PAC

Ver `AUTOMATIZACION_CORREOS.md`. Si el esquema en español ya está creado, se aplican únicamente las migraciones pendientes, sin volver a ejecutar el reinicio `database/supabase.sql`. La ampliación 06 incorpora el historial de correos, la 07 confirma la habitación 10 y la 08 autoriza las cuentas de acceso ya creadas en Authentication.

La importación confirmada está en `database/03_inquilinos_casa_pac.sql`: 12 habitaciones, 9 inquilinos, montos en CLP, dos unidades en construcción y Anexo 12 disponible. Los contactos y calendarios desconocidos permanecen pendientes. El SQL no inventa pagos históricos ni carga los préstamos de las imágenes.

La misma carga está disponible para la base SQLite local con `node database/cargar-casa-pac.cjs`. Se agrega solo lo que falta y se conservan los contactos o calendarios ya editados. Esta carga local no se sincroniza automáticamente con Supabase.

## Alcance actual

SQLite conserva el modo de borradores y alertas del período actual. El modo Supabase incorpora cuotas por período, advertencias desde los siete días, comprobantes para cliente y administrador, cola de envío, reintentos y seguimiento de aceptación por el proveedor. El envío está configurado en el proyecto actual y requiere desplegar la función y configurar Secrets en cada instalación nueva. Los arriendos usan la marca Antonini Casa PAC 4009 y los préstamos Antonini Inversiones. La proyección de préstamos sigue usando interés mensual sobre saldo y cuota fija; no se importaron ni validaron condiciones diferentes de las planillas.

La interfaz y su servidor están configurados para uso local y exigen autenticación y autorización de administrador. El login incluye mostrar/ocultar contraseña, recuperación por correo y cierre a las seis horas si no se marca Mantener sesión; al marcarla, dura hasta 30 días. Las API de datos también están protegidas. Para publicación remota se necesita un despliegue HTTPS y adaptar la configuración de hosts del servidor. Supabase tiene RLS; la clave de servicio solo se usa en el servidor y en la función privada. La conciliación bancaria, auditoría de cambios y confirmaciones de entrega por webhook siguen pendientes.
