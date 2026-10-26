# Antonini · Gestión de cobros

Prototipo funcional en español para arriendos, préstamos y cobranza. Abrir `index.html` en un navegador moderno, o servir esta carpeta con un servidor estático. No requiere instalación ni compilación.

## Funciones disponibles

- Resumen de cobros, saldos, ocupación y préstamos con datos de ejemplo relativos al mes actual.
- Habitaciones, asignación de inquilino y equipamiento editable con campos personalizados.
- Personas compartidas entre inquilinos, deudores y avales; préstamos vinculados desde la habitación.
- Préstamos con capital, tasa mensual, cuota, aval y capitalista; proyección estimada a seis meses.
- Registro manual de pagos parciales por período, desglose de capital e interés, historial y comprobante descargable.
- Alertas del mes actual según día de vencimiento y saldo, borradores de recordatorio y comprobante, exportación CSV.
- Configuración de intervalo de recordatorios y contacto de administración.

## Alcance y pendientes para producción

Los registros se almacenan en `localStorage`, solo en el navegador utilizado. Los datos iniciales son ficticios. No hay autenticación, permisos, base de datos compartida, conciliación bancaria ni envíos reales. El botón de recordatorios prepara borradores; no ejecuta un servicio programado. El prototipo calcula alertas del período actual: el arrastre de mora histórica y las fechas de inicio/fin de contratos requieren el modelo de cuotas del servidor.

La proyección de préstamos usa interés mensual sobre saldo y una cuota fija; debe ajustarse a las condiciones reales acordadas. Los pagos históricos de ejemplo no son un cronograma contractual. Los comprobantes se generan con los datos actuales del navegador.

Para producción se requiere un servidor con base de datos relacional, control de acceso total/parcial, auditoría de pagos, contratos y cuotas con vencimientos, capitalistas administrables, tareas programadas con reintentos e idempotencia, proveedor de correo y WhatsApp Business. Las credenciales deben permanecer en el servidor. El administrador debe verificar la recepción del dinero antes de registrar el pago.
