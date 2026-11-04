import assert from 'node:assert/strict';
import { calcularProyeccionBilletera } from '../../frontend/src/lib/projection.ts';
import { formatearMoneda } from '../../frontend/src/types/wallet.ts';
import { aCentavos } from '../../frontend/src/lib/money.ts';

let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
const wallet = (moneda = 'PEN', id = 1) => ({ id, user_id: 'owner', nombre: 'Pruebas', moneda, archivada: false, es_principal: true });
const row = value => ({ user_id: 'owner', billetera_id: 1, ...value });
const salary = (mes, s15, s30) => row({ anio: 2026, mes, sueldo_15: s15, sueldo_30: s30 });
const movement = (id, day, monto, tipo = 'gasto') => row({ id, tipo, monto, descripcion: 'Pago', fecha: `2026-11-${String(day).padStart(2,'0')}`, categoria_id: null, recurrente_id: null, pago_confirmado: true });
const data = () => ({ billetera: wallet(), hoy: '2026-11-03', montoBase: 1000, categorias: [], movimientos: [movement(1,5,10),movement(2,15,20),movement(3,20,30),movement(4,30,40)], sueldos: [salary(10,100,200),salary(11,0,500)], recurrentes: [], deudas: [], cuotas: [], pagosDeuda: [] });
for (const moneda of ['PEN','USD','EUR']) {
  const input = { ...data(), billetera: wallet(moneda) };
  const before = JSON.stringify(input);
  const result = calcularProyeccionBilletera(input);
  const nov = result[0];
  check(result.length, 13);
  check([nov.balanceInicio,nov.bolsilloAntes15,nov.balanceTras15,nov.bolsilloAntesFinMes,nov.balanceFin], [1000,990,1070,1040,1200]);
  check([nov.ingresosTotales,nov.gastosTotales], [300,100]);
  check(result[1].balanceInicio, 1200);
  check(result[1].balanceFin, 1700);
  check(result[2].balanceFin, 1700);
  check(result.every(month => month.moneda === moneda && month.billeteraId === 1), true);
  check(JSON.stringify(input), before);
  // Foreign wallets/users and unscoped rows cannot change any projection or category.
  const mixed = structuredClone(input);
  for (const field of ['movimientos','sueldos','categorias','recurrentes','deudas','cuotas','pagosDeuda']) {
    mixed[field].push({ ...row({ id: 999, monto: 999999, fecha: '2020-01-01', anio: 2020, mes: 0, sueldo_15: 999999 }), billetera_id: 2 });
    mixed[field].push({ ...row({ id: 998, monto: 999999, fecha: '2020-01-01' }), user_id: 'other' });
    mixed[field].push({ id: 997, monto: 999999, fecha: '2020-01-01' });
  }
  check(calcularProyeccionBilletera(mixed), result);
}
const partial = data();
partial.recurrentes.push(row({id:1,descripcion:'Servicio',tipo:'gasto',monto:5,dia_pago:10,categoria_id:null,periodos:'2026-11',tipo_recurrencia:'mensual'}));
partial.deudas.push(row({id:1,nombre:'Crédito',monto_recibido:50,categoria_id:null}));
partial.cuotas.push(row({id:1,deuda_id:1,numero:1,monto:50,fecha:'2026-11-20'}));
partial.pagosDeuda.push(row({id:1,cuota_id:1,monto:20,fecha:'2026-11-18',movimiento_id:5}));
partial.movimientos.push(movement(5,18,20));
let nov = calcularProyeccionBilletera(partial)[0];
check(nov.balanceFin,1145);
check(nov.items.find(i=>i.origen==='cuota').monto,30);
check(nov.gastosTotales,155);
// A recurring occurrence already materialized in the agenda is counted once.
partial.movimientos.push({...movement(6,10,5),recurrente_id:1});
check(calcularProyeccionBilletera(partial)[0].balanceFin,1145);
check(calcularProyeccionBilletera(partial)[0].items.filter(i=>i.descripcion==='Servicio (Fijo)').length,0);
const cents = {...data(),montoBase:0.1,movimientos:[movement(1,30,0.3)],sueldos:[salary(10,0.2,0)]};
check(calcularProyeccionBilletera(cents)[0].balanceFin,0);
check(aCentavos(1.005),101); check(aCentavos(-1.005),-101);
for (const [code,symbol] of [['PEN','S/'],['USD','US$'],['EUR','€']]) {
  check(formatearMoneda(1234.5,code),`${symbol} 1,234.50`);
  check(formatearMoneda(-10,code),`-${symbol} 10.00`);
  check(formatearMoneda(-0.0001,code),`${symbol} 0.00`);
  check(formatearMoneda(NaN,code),'—');
}
const legacy = data();
legacy.modoLegacy = true; legacy.billetera = wallet('PEN',-1);
for (const field of ['movimientos','sueldos']) legacy[field] = legacy[field].map(({billetera_id,...r})=>r);
check(calcularProyeccionBilletera(legacy)[0].balanceFin,1200);
const feb = {...data(),hoy:'2028-02-01',movimientos:[],sueldos:[row({anio:2028,mes:1,sueldo_15:0,sueldo_30:100})]};
nov = calcularProyeccionBilletera(feb)[0];
check(nov.ultimoDia,29); check(nov.items[0].fecha,'2028-02-29'); check(nov.balanceFin,1100);
console.log(`Etapa 4: ${checks} comprobaciones correctas; sin red ni escrituras de datos.`);
