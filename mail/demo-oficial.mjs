// Vistas de demostracion con acabado oficial; no son registros de la base de datos.
import {demosActualizadas} from './demo-actualizado.mjs';
const base={...demosActualizadas[1],id:'arriendo-abono-120000',datos:{...demosActualizadas[1].datos,es_prueba:false,habitacion:'Habitación 03',concepto:'Habitación 03',periodo:'2026-11',fecha:'2026-11-03',referencia:'REC-20261103-001',monto:120000,capital:120000,saldo:70000,historial:[{periodo:'2026-11',mensualidad:190000,pagado:120000,saldo:70000}]}};
export const demosOficiales=[
 base,
 {...base,id:'arriendo-completado-70000',datos:{...base.datos,monto:70000,capital:70000,saldo:0,referencia:'REC-20261103-002',historial:[{periodo:'2026-11',mensualidad:190000,pagado:190000,saldo:0}]}},
 {...base,id:'arriendo-aviso-saldo-70000',tipo:'atraso_7_dias',datos:{...base.datos,periodo:'2026-10',vencimiento:'2026-10-27',dias_atraso:7,historial:[{periodo:'2026-10',mensualidad:190000,pagado:120000,saldo:70000}]}},
 {...demosActualizadas[0],id:'inversiones-recordatorio',datos:{...demosActualizadas[0].datos,es_prueba:false,concepto:'Préstamo INV-001',referencia:'INV-001'}}
];
