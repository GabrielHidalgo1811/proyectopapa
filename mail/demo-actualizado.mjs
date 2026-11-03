const historial=[5,6,7,8,9,10].map(m=>({periodo:`2026-${String(m).padStart(2,'0')}`,mensualidad:170000,pagado:m===10?120000:170000,saldo:m===10?50000:0}));
const datos={es_prueba:true,cliente:'Gabriel Hidalgo',tipo_contrato:'arriendo',habitacion:'Habitación 01',concepto:'Habitación 01',periodo:'2026-10',fecha:'2026-10-26',monto:120000,capital:120000,interes:0,saldo:50000,referencia:'PRUEBA-SIN-PAGO-REAL',whatsapp:'+56 9 6725 1612',correo_administracion:'tvxsiempre@gmail.com',historial,historial_desde:'2026-05',historial_hasta:'2026-10'};
const base={audiencia:'cliente',destinatario:'gabrielhidalgo1811@gmail.com'};
export const demosActualizadas=[
  {...base,id:'prueba-textos-v3-prestamo',tipo:'atraso_7_dias',datos:{...datos,tipo_contrato:'prestamo',habitacion:null,concepto:'Préstamo de ejemplo',monto:140000,capital:0,interes:0,saldo:140000,vencimiento:'2026-10-19',dias_atraso:7,capital_inicial:1200000,tasa_mensual:5,abonos_capital:344810,saldo_capital:855190,
    historial:historial.map((r,i)=>{const capitalAntes=[1200000,1120000,1036000,947800,947800,855190][i];const capital=[80000,84000,88200,0,92610,0][i];const interes=[60000,56000,51800,0,47390,0][i];const pagado=capital+interes;return {...r,mensualidad:140000,capital_antes:capitalAntes,capital,interes,pagado,saldo:140000-pagado,fecha:pagado?r.periodo+'-26':null};})}},
  {...base,id:'prueba-textos-v3-arriendo',tipo:'pago_recibido',datos},
  {...base,id:'prueba-textos-v3-alerta-arriendo',tipo:'atraso_7_dias',datos:{...datos,saldo:170000,vencimiento:'2026-10-19',dias_atraso:7,historial:historial.map(r=>r.periodo==='2026-10'?{...r,pagado:0,saldo:170000}:r)}}
];
