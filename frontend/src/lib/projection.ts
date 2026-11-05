import { NOMBRES_MESES, MESES_CORTOS, obtenerUltimoDiaMes, recurrenteAplicaEnMes, fechaRealMovimiento } from '../types/wallet.ts';
import type { Billetera, Categoria, SueldoMes, MovimientoRecurrente, MovimientoAgenda, Deuda, DeudaCuota, DeudaPago } from '../types/wallet.ts';
import { aCentavos, deCentavos } from './money.ts';

export interface ItemDetalleMes {
  vencimientoOriginal?: string;
  id: string;
  fecha: string;
  dia: number;
  descripcion: string;
  monto: number;
  tipo: 'ingreso' | 'gasto';
  origen: 'realizado' | 'recurrente' | 'cuota' | 'sueldo';
  categoriaNombre: string;
  categoriaColor: string;
}

export interface ProyeccionMesCalculada {
  antes15Disponible: boolean;
  tras15Disponible: boolean;
  antesFinDisponible: boolean;
  billeteraId: number;
  moneda: Billetera["moneda"];
  llave: string;
  anio: number;
  mes: number;
  label: string;
  labelCorto: string;
  ultimoDia: number;
  esPasado: boolean;
  esActual: boolean;
  balanceInicio: number;
  bolsilloAntes15: number;
  balanceTras15: number;
  bolsilloAntesFinMes: number;
  balanceFin: number;
  ingresosTotales: number;
  gastosTotales: number;
  sueldo15: number;
  sueldo30: number;
  modalidadSueldo: 'quincenal' | 'mensual_fin' | 'mensual_15' | 'sin_sueldo';
  items: ItemDetalleMes[];
}

export interface DatosProyeccion {
  billetera: Billetera;
  modoLegacy?: boolean;
  hoy: string; // YYYY-MM-DD, in the user's local calendar
  montoBase: number;
  fechaReferencia?: string | null;
  categorias: Categoria[];
  sueldos: SueldoMes[];
  recurrentes: MovimientoRecurrente[];
  movimientos: MovimientoAgenda[];
  deudas: Deuda[];
  cuotas: DeudaCuota[];
  pagosDeuda: DeudaPago[];
}

/** One wallet, one original currency. Never aggregates or converts wallets. */
export function calcularProyeccionBilletera(datos: DatosProyeccion): ProyeccionMesCalculada[] {
  const { billetera, montoBase } = datos;
  const referencia=datos.fechaReferencia||null;
  const despues=(fecha:string)=>!referencia||fecha>=referencia;
  const pisoPendiente=referencia&&referencia>=datos.hoy?referencia:datos.hoy;
  const fechaPendiente=(fecha:string)=>fecha<pisoPendiente?pisoPendiente:fecha;
  const [anioHoy, mesNumero] = datos.hoy.split('-').map(Number);
  const mesHoy = mesNumero - 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.hoy) || mesHoy < 0 || mesHoy > 11) throw Error('Fecha de proyección no válida');
  const own = <T extends { user_id?: string; billetera_id?: number }>(rows: T[]) => rows.filter(row =>
    row.user_id === billetera.user_id && (datos.modoLegacy ? row.billetera_id === undefined : row.billetera_id === billetera.id));
  const categorias = own(datos.categorias);
  const sueldos = own(datos.sueldos);
  const movimientos = own(datos.movimientos);
  const recurrentes = own(datos.recurrentes);
  const deudas = own(datos.deudas).filter(d=>!d.archivada);
  const cuotas = own(datos.cuotas).filter(c=>deudas.some(d=>d.id===c.deuda_id));
  const pagosDeuda = own(datos.pagosDeuda);
  const mapaCategorias = new Map(categorias.map(c => [c.id, { nombre: c.nombre, color: c.color }]));
  let anioInicio = anioHoy;
  let mesInicio = mesHoy;

  movimientos.forEach((m) => {
    if (!m.fecha) return;
    const [y, month] = m.fecha.split('-').map(Number);
    const mIdx = month - 1;
    if (y < anioInicio || (y === anioInicio && mIdx < mesInicio)) {
      anioInicio = y;
      mesInicio = mIdx;
    }
  });

  sueldos.forEach((s) => {
    if (s.sueldo_15 > 0 || s.sueldo_30 > 0) {
      if (s.anio < anioInicio || (s.anio === anioInicio && s.mes < mesInicio)) {
        anioInicio = s.anio;
        mesInicio = s.mes;
      }
    }
  });
  if(referencia) {
    const [y,m]=referencia.split('-').map(Number);
    anioInicio=y; mesInicio=m-1;
  }

  // Proyectar hasta 12 meses a partir del mes actual
  const fechaLimite = new Date(anioHoy, mesHoy + 12, 1);
  const anioLimite = fechaLimite.getFullYear();
  const mesLimite = fechaLimite.getMonth();

  let balanceAcumulado = aCentavos(montoBase);
  const resultado: ProyeccionMesCalculada[] = [];

  let aCursor = anioInicio;
  let mCursor = mesInicio;

  while (aCursor < anioLimite || (aCursor === anioLimite && mCursor <= mesLimite)) {
    const llave = `${aCursor}-${mCursor}`;
    const ultimoDia = obtenerUltimoDiaMes(aCursor, mCursor);
    const esPasado = aCursor < anioHoy || (aCursor === anioHoy && mCursor < mesHoy);
    const esActual = aCursor === anioHoy && mCursor === mesHoy;

    // Sueldos del mes
    const regSueldo = sueldos.find((s) => s.anio === aCursor && s.mes === mCursor);
    const prefijoFecha=`${aCursor}-${String(mCursor+1).padStart(2,'0')}`;
    const s15 = regSueldo&&despues(prefijoFecha+'-15') ? aCentavos(regSueldo.sueldo_15) : 0;
    const s30 = regSueldo&&despues(prefijoFecha+'-'+String(ultimoDia).padStart(2,'0')) ? aCentavos(regSueldo.sueldo_30) : 0;

    const itemsMes: ItemDetalleMes[] = [];
    const mesStr = String(mCursor + 1).padStart(2, '0');
    const prefijoMes = `${aCursor}-${mesStr}`;

    // 1. Movimientos en agenda (confirmados y pendientes) de este mes
    const fechaProyectada=(m:MovimientoAgenda)=>m.pago_confirmado?fechaRealMovimiento(m):fechaPendiente(m.fecha);
    const movsDelMes = movimientos.filter((m) => m.fecha && (m.pago_confirmado?despues(fechaRealMovimiento(m)):true) && fechaProyectada(m).startsWith(prefijoMes));
    // Suppress virtual recurrence by its due month, even when paid on another date.
    const recurrentesYaEnAgenda = new Set<number>(movimientos.filter(m=>m.fecha.startsWith(prefijoMes)&&m.recurrente_id).map(m=>m.recurrente_id!));

    movsDelMes.forEach((m) => {
      const fecha=fechaProyectada(m);
      const dia = Number(fecha.split('-')[2]) || 1;
      const cat = m.categoria_id ? mapaCategorias.get(m.categoria_id) : undefined;
      itemsMes.push({
        id: `mov-${m.id}`,
        fecha,
        vencimientoOriginal: !m.pago_confirmado&&m.fecha!==fecha ? m.fecha : undefined,
        dia,
        descripcion: m.descripcion,
        monto: m.monto,
        tipo: m.tipo,
        origen: m.pago_confirmado ? 'realizado' : 'recurrente',
        categoriaNombre: cat ? cat.nombre : 'Otros',
        categoriaColor: cat ? cat.color : '#7f8c8d',
      });
    });

    // 2. Plantillas recurrentes que aún no tienen registro en movimientos_agenda en este mes (solo para mes actual o futuro)
    if (!esPasado) {
      recurrentes.forEach((rec) => {
        if (!recurrentesYaEnAgenda.has(rec.id) && recurrenteAplicaEnMes(rec, aCursor, mCursor)) {
          const diaReal = Math.min(rec.dia_pago, ultimoDia);
          const vencimiento = `${prefijoMes}-${String(diaReal).padStart(2, '0')}`;
          const fechaRec=fechaPendiente(vencimiento);
          if(!fechaRec.startsWith(prefijoMes)) return;
          const cat = rec.categoria_id ? mapaCategorias.get(rec.categoria_id) : undefined;
          itemsMes.push({
            id: `rec-virtual-${rec.id}-${llave}`,
            fecha: fechaRec,
            vencimientoOriginal: vencimiento!==fechaRec?vencimiento:undefined,
            dia: Number(fechaRec.slice(-2)),
            descripcion: `${rec.descripcion} (Fijo)`,
            monto: rec.monto,
            tipo: rec.tipo,
            origen: 'recurrente',
            categoriaNombre: cat ? cat.nombre : 'Servicios',
            categoriaColor: cat ? cat.color : '#3498db',
          });
        }
      });
    }

    // 3. Cuotas de deuda con saldo pendiente en este mes (que no estén ya reflejadas en un movimiento de pago)
    cuotas
      .filter((c) => c.fecha && fechaPendiente(c.fecha).startsWith(prefijoMes))
      .forEach((c) => {
        const pagado = pagosDeuda
          .filter((p) => p.cuota_id === c.id)
          .reduce((acc, p) => acc + aCentavos(p.monto), 0);
        const pendiente = aCentavos(c.monto) - pagado;
        if (pendiente > 0) {
          const deuda = deudas.find((d) => d.id === c.deuda_id);
          const cat = deuda?.categoria_id ? mapaCategorias.get(deuda.categoria_id) : undefined;
          const fecha=fechaPendiente(c.fecha);
          const dia = Number(fecha.split('-')[2]) || 1;
          itemsMes.push({
            id: `cuota-${c.id}`,
            fecha,
            vencimientoOriginal: c.fecha!==fecha?c.fecha:undefined,
            dia,
            descripcion: `${deuda ? deuda.nombre : 'Deuda'} · Cuota #${c.numero}`,
            monto: deCentavos(pendiente),
            tipo: 'gasto',
            origen: 'cuota',
            categoriaNombre: cat ? cat.nombre : 'Deudas',
            categoriaColor: cat ? cat.color : '#e74c3c',
          });
        }
      });

    // Separar por tramos del mes (1-14, 15, 16-penúltimo, último día)
    let ing1a = 0, gas1a = 0;
    let ing1b = 0, gas1b = 0;
    let ing2a = 0, gas2a = 0;
    let ing2b = 0, gas2b = 0;

    itemsMes.forEach((item) => {
      if (item.dia < 15) {
        if (item.tipo === 'ingreso') ing1a += aCentavos(item.monto);
        else gas1a += aCentavos(item.monto);
      } else if (item.dia === 15) {
        if (item.tipo === 'ingreso') ing1b += aCentavos(item.monto);
        else gas1b += aCentavos(item.monto);
      } else if (item.dia < ultimoDia) {
        if (item.tipo === 'ingreso') ing2a += aCentavos(item.monto);
        else gas2a += aCentavos(item.monto);
      } else {
        if (item.tipo === 'ingreso') ing2b += aCentavos(item.monto);
        else gas2b += aCentavos(item.monto);
      }
    });

    const modalidadSueldo: 'quincenal' | 'mensual_fin' | 'mensual_15' | 'sin_sueldo' =
      s15 > 0 && s30 > 0
        ? 'quincenal'
        : s15 === 0 && s30 > 0
        ? 'mensual_fin'
        : s15 > 0 && s30 === 0
        ? 'mensual_15'
        : 'sin_sueldo';

    // Agregar sueldos al detalle visual
    if (s15 > 0) {
      itemsMes.push({
        id: `s15-${llave}`,
        fecha: `${prefijoMes}-15`,
        dia: 15,
        descripcion: modalidadSueldo === 'mensual_15' ? 'Sueldo Mensual' : 'Sueldo Quincena',
        monto: deCentavos(s15),
        tipo: 'ingreso',
        origen: 'sueldo',
        categoriaNombre: 'Sueldo',
        categoriaColor: '#10b981',
      });
    }
    if (s30 > 0) {
      itemsMes.push({
        id: `s30-${llave}`,
        fecha: `${prefijoMes}-${String(ultimoDia).padStart(2, '0')}`,
        dia: ultimoDia,
        descripcion: modalidadSueldo === 'mensual_fin' ? 'Sueldo Mensual' : 'Sueldo Fin de mes',
        monto: deCentavos(s30),
        tipo: 'ingreso',
        origen: 'sueldo',
        categoriaNombre: 'Sueldo',
        categoriaColor: '#10b981',
      });
    }

    const balanceInicio = balanceAcumulado;
    const bolsilloAntes15 = balanceInicio + ing1a - gas1a;
    const balanceTras15 = bolsilloAntes15 + s15 + ing1b - gas1b;
    const bolsilloAntesFinMes = balanceTras15 + ing2a - gas2a;
    const balanceFin = bolsilloAntesFinMes + s30 + ing2b - gas2b;

    balanceAcumulado = balanceFin;

    const ingresosTotales = s15 + s30 + ing1a + ing1b + ing2a + ing2b;
    const gastosTotales = gas1a + gas1b + gas2a + gas2b;

    itemsMes.sort((a, b) => a.dia - b.dia);

    resultado.push({
      antes15Disponible: !referencia?.startsWith(prefijoMes)||Number(referencia.slice(-2))<=14,
      tras15Disponible: !referencia?.startsWith(prefijoMes)||Number(referencia.slice(-2))<=15,
      antesFinDisponible: !referencia?.startsWith(prefijoMes)||Number(referencia.slice(-2))<ultimoDia,
      billeteraId: billetera.id,
      moneda: billetera.moneda,
      llave,
      anio: aCursor,
      mes: mCursor,
      label: `${NOMBRES_MESES[mCursor]} ${aCursor}`,
      labelCorto: `${MESES_CORTOS[mCursor]} ${String(aCursor).slice(-2)}`,
      ultimoDia,
      esPasado,
      esActual,
      balanceInicio: deCentavos(balanceInicio),
      bolsilloAntes15: deCentavos(bolsilloAntes15),
      balanceTras15: deCentavos(balanceTras15),
      bolsilloAntesFinMes: deCentavos(bolsilloAntesFinMes),
      balanceFin: deCentavos(balanceFin),
      ingresosTotales: deCentavos(ingresosTotales),
      gastosTotales: deCentavos(gastosTotales),
      sueldo15: deCentavos(s15),
      sueldo30: deCentavos(s30),
      modalidadSueldo,
      items: itemsMes,
    });

    mCursor++;
    if (mCursor > 11) {
      mCursor = 0;
      aCursor++;
    }
  }

  return resultado;
}
