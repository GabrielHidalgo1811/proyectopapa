# Base de datos de Antonini en español

`supabase.sql` reemplaza las tablas de Antonini en inglés por tablas en español. También permite repetir el reinicio de las tablas en español. Cada ejecución elimina sus registros. No elimina `auth.users`, los archivos de Storage ni tablas ajenas a esta lista.

## Flujo de trabajo

1. Registrar nombre, teléfono y correo en `personas`.
2. Si corresponde, registrar el rol `inquilino` o `aval` en `roles_persona`. Una misma persona puede tener ambos roles. Un deudor se reconoce por sus préstamos.
3. Crear una habitación de Casa PAC en `habitaciones`. `inquilino_id` apunta a la persona que la ocupa; vacío significa sin inquilino asignado. La mensualidad y el depósito están en pesos chilenos enteros.
4. Registrar los elementos de esa habitación en `equipamiento_habitacion`, vinculados por `habitacion_id`.
5. Crear un préstamo en `prestamos`: `deudor_id` y `aval_id` apuntan a dos personas distintas. El aval pertenece al préstamo, nunca a la habitación.
6. Registrar cada abono en `pagos`. Se indica `habitacion_id` o `prestamo_id`, nunca ambos. `periodo` identifica el mes abonado; `fecha_recepcion` indica cuándo se recibió el dinero. El monto se desglosa en abono a capital e interés. Para arriendos, el sistema actual registra todo el importe como abono sin interés.
7. Preparar comprobantes o recordatorios en `borradores`. Guardar un borrador no envía un mensaje.

## Tablas de soporte

- `configuracion`: correo y teléfono de administración, intervalo de recordatorios y preferencias.
- `metadatos`: revisión de datos y versión del esquema; se usará para controlar el guardado al integrar Supabase.
- `administradores`: relaciona los usuarios autorizados con `auth.users`, que pertenece a Supabase.

Solo `configuracion` y `metadatos` comienzan con una fila técnica; las demás tablas comienzan vacías. Para acceder desde una aplicación será necesario iniciar sesión y autorizar el usuario según las instrucciones al final del SQL.

## Correspondencias

| Antes | Ahora |
| --- | --- |
| people | personas |
| person_roles | roles_persona |
| rooms | habitaciones |
| room_services | equipamiento_habitacion |
| loans | prestamos |
| payments | pagos |
| outbox | borradores |
| settings | configuracion |
| metadata | metadatos |
| app_admins | administradores |

Los nombres técnicos no llevan tildes para facilitar consultas y código. La interfaz puede mostrarlas normalmente.

## Estado de integración

Este SQL crea las tablas remotas. La aplicación local sigue usando SQLite y su esquema en inglés. Todavía falta conectar la aplicación a Supabase, mapear estos nombres e incorporar el inicio de sesión. Ejecutar el SQL no hace esa conexión automáticamente.
