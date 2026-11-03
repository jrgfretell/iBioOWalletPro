import React, { useState, useMemo, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  NOMBRES_MESES,
  MESES_CORTOS,
  formatearMoneda,
  obtenerUltimoDiaMes,
  fechaHoyISO,
} from '../types/wallet';
import type { ActiveTab } from '../types/wallet';
import {
  Edit3,
  PieChart,
  TrendingUp,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  DollarSign,
  Eye,
  X,
  PlusCircle,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: ActiveTab) => void;
}

interface ItemDetalleMes {
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

interface ProyeccionMesCalculada {
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
  items: ItemDetalleMes[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    montoBase,
    categorias,
    sueldos,
    recurrentes,
    movimientos,
    deudas,
    cuotas,
    pagosDeuda,
    actualizarMontoBase,
    guardarSueldoMes,
    guardarSueldoAnual,
  } = useWallet();

  const hoy = new Date();
  const anioHoy = hoy.getFullYear();
  const mesHoy = hoy.getMonth();
  const fechaHoyStr = fechaHoyISO();

  // Estado para editar saldo base
  const [editandoBase, setEditandoBase] = useState(false);
  const [inputBase, setInputBase] = useState(String(montoBase));
  const [guardandoBase, setGuardandoBase] = useState(false);

  // Estado para Gastos por Categoría
  const [catMes, setCatMes] = useState<number>(mesHoy);
  const [catAnio, setCatAnio] = useState<number>(anioHoy);

  // Estado para Configurador de Sueldos
  const [sueldoAnio, setSueldoAnio] = useState<number>(anioHoy);
  const [sueldoMes, setSueldoMes] = useState<number>(mesHoy);
  const [modoSueldo, setModoSueldo] = useState<'quincenal' | 'mensual'>('quincenal');
  const [inputSueldo15, setInputSueldo15] = useState<string>('0');
  const [inputSueldo30, setInputSueldo30] = useState<string>('0');
  const [aplicarRestoAnio, setAplicarRestoAnio] = useState<boolean>(false);
  const [guardandoSueldo, setGuardandoSueldo] = useState<boolean>(false);
  const [mensajeSueldo, setMensajeSueldo] = useState<string | null>(null);

  // Estado para Proyecciones
  const [mostrarHistorico, setMostrarHistorico] = useState<boolean>(false);
  const [mesesAbiertos, setMesesAbiertos] = useState<Record<string, boolean>>({
    [`${anioHoy}-${mesHoy}`]: true,
  });
  const [modalDetalleMes, setModalDetalleMes] = useState<ProyeccionMesCalculada | null>(null);

  // Sincronizar inputs de sueldo cuando cambia mes/año seleccionado o sueldos en BD
  useEffect(() => {
    const registro = sueldos.find((s) => s.anio === sueldoAnio && s.mes === sueldoMes);
    const s15 = registro ? registro.sueldo_15 : 0;
    const s30 = registro ? registro.sueldo_30 : 0;
    setInputSueldo15(String(s15));
    setInputSueldo30(String(s30));
    if (s15 === 0 && s30 > 0) {
      setModoSueldo('mensual');
    } else {
      setModoSueldo('quincenal');
    }
  }, [sueldoAnio, sueldoMes, sueldos]);

  useEffect(() => {
    setInputBase(String(montoBase));
  }, [montoBase]);

  // Mapa rápido de categorías
  const mapaCategorias = useMemo(() => {
    const map = new Map<number, { nombre: string; color: string }>();
    categorias.forEach((c) => map.set(c.id, { nombre: c.nombre, color: c.color }));
    return map;
  }, [categorias]);

  // Guardar saldo base
  const handleGuardarBase = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(inputBase);
    if (isNaN(val) || val < 0) return;
    setGuardandoBase(true);
    await actualizarMontoBase(val);
    setGuardandoBase(false);
    setEditandoBase(false);
  };

  // Guardar sueldo del mes
  const handleGuardarSueldo = async (e: React.FormEvent) => {
    e.preventDefault();
    const s15 = modoSueldo === 'mensual' ? 0 : Math.max(0, parseFloat(inputSueldo15) || 0);
    const s30 = Math.max(0, parseFloat(inputSueldo30) || 0);
    setGuardandoSueldo(true);
    let ok = false;
    if (aplicarRestoAnio) {
      ok = await guardarSueldoAnual(sueldoAnio, sueldoMes, s15, s30);
    } else {
      ok = await guardarSueldoMes(sueldoAnio, sueldoMes, s15, s30);
    }
    setGuardandoSueldo(false);
    if (ok) {
      setMensajeSueldo(
        aplicarRestoAnio
          ? `Sueldos guardados de ${NOMBRES_MESES[sueldoMes]} a Diciembre ${sueldoAnio}`
          : `Sueldo de ${NOMBRES_MESES[sueldoMes]} ${sueldoAnio} actualizado`
      );
      setTimeout(() => setMensajeSueldo(null), 3000);
    }
  };

  // Calcular Próximos Pagos Pendientes (Cuotas de deudas + Movimientos pendientes)
  const proximosPagos = useMemo(() => {
    const lista: {
      id: string;
      nombre: string;
      etiqueta: string;
      fecha: string;
      monto: number;
      vencido: boolean;
      esHoy: boolean;
    }[] = [];

    // 1. Cuotas con saldo pendiente
    cuotas.forEach((c) => {
      const pagado = pagosDeuda
        .filter((p) => p.cuota_id === c.id)
        .reduce((acc, p) => acc + p.monto, 0);
      const pendiente = Math.round((c.monto - pagado) * 100) / 100;
      if (pendiente > 0.009) {
        const deuda = deudas.find((d) => d.id === c.deuda_id);
        const totalCuotasDeuda = cuotas.filter((q) => q.deuda_id === c.deuda_id).length;
        lista.push({
          id: `cuota-${c.id}`,
          nombre: deuda ? deuda.nombre : `Deuda #${c.deuda_id}`,
          etiqueta: `Cuota ${c.numero}/${totalCuotasDeuda}`,
          fecha: c.fecha,
          monto: pendiente,
          vencido: c.fecha < fechaHoyStr,
          esHoy: c.fecha === fechaHoyStr,
        });
      }
    });

    // 2. Movimientos en agenda marcados como no confirmados (pendientes)
    movimientos
      .filter((m) => m.tipo === 'gasto' && !m.pago_confirmado)
      .forEach((m) => {
        lista.push({
          id: `mov-${m.id}`,
          nombre: m.descripcion,
          etiqueta: m.es_recurrente ? 'Recurrente' : 'Programado',
          fecha: m.fecha,
          monto: m.monto,
          vencido: m.fecha < fechaHoyStr,
          esHoy: m.fecha === fechaHoyStr,
        });
      });

    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [cuotas, pagosDeuda, deudas, movimientos, fechaHoyStr]);

  // Calcular Gastos por Categoría del mes seleccionado
  const reporteGastosCategoria = useMemo(() => {
    const gastosDelMes = movimientos.filter((m) => {
      if (m.tipo !== 'gasto' || !m.fecha) return false;
      const [y, month] = m.fecha.split('-').map(Number);
      return y === catAnio && month - 1 === catMes;
    });

    const agrupado: Record<string, { nombre: string; color: string; monto: number }> = {};
    let total = 0;

    gastosDelMes.forEach((g) => {
      const cat = g.categoria_id ? mapaCategorias.get(g.categoria_id) : undefined;
      const nombre = cat ? cat.nombre : 'Otros';
      const color = cat ? cat.color : '#7f8c8d';
      if (!agrupado[nombre]) {
        agrupado[nombre] = { nombre, color, monto: 0 };
      }
      agrupado[nombre].monto += g.monto;
      total += g.monto;
    });

    const items = Object.values(agrupado).sort((a, b) => b.monto - a.monto);
    return { items, total };
  }, [movimientos, catAnio, catMes, mapaCategorias]);

  // MOTOR DE PROYECCIÓN ACUMULATIVA MENSUAL
  const proyecciones = useMemo(() => {
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

    // Proyectar hasta 12 meses a partir del mes actual
    const fechaLimite = new Date(anioHoy, mesHoy + 12, 1);
    const anioLimite = fechaLimite.getFullYear();
    const mesLimite = fechaLimite.getMonth();

    let balanceAcumulado = montoBase;
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
      const s15 = regSueldo ? regSueldo.sueldo_15 : 0;
      const s30 = regSueldo ? regSueldo.sueldo_30 : 0;

      const itemsMes: ItemDetalleMes[] = [];
      const mesStr = String(mCursor + 1).padStart(2, '0');
      const prefijoMes = `${aCursor}-${mesStr}`;

      // 1. Movimientos en agenda (confirmados y pendientes) de este mes
      const movsDelMes = movimientos.filter((m) => m.fecha && m.fecha.startsWith(prefijoMes));
      const recurrentesYaEnAgenda = new Set<number>();

      movsDelMes.forEach((m) => {
        if (m.recurrente_id) recurrentesYaEnAgenda.add(m.recurrente_id);
        const dia = Number(m.fecha.split('-')[2]) || 1;
        const cat = m.categoria_id ? mapaCategorias.get(m.categoria_id) : undefined;
        itemsMes.push({
          id: `mov-${m.id}`,
          fecha: m.fecha,
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
          if (!recurrentesYaEnAgenda.has(rec.id)) {
            const diaReal = Math.min(rec.dia_pago, ultimoDia);
            const fechaRec = `${prefijoMes}-${String(diaReal).padStart(2, '0')}`;
            const cat = rec.categoria_id ? mapaCategorias.get(rec.categoria_id) : undefined;
            itemsMes.push({
              id: `rec-virtual-${rec.id}-${llave}`,
              fecha: fechaRec,
              dia: diaReal,
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
        .filter((c) => c.fecha && c.fecha.startsWith(prefijoMes))
        .forEach((c) => {
          const pagado = pagosDeuda
            .filter((p) => p.cuota_id === c.id)
            .reduce((acc, p) => acc + p.monto, 0);
          const pendiente = Math.round((c.monto - pagado) * 100) / 100;
          if (pendiente > 0.009) {
            const deuda = deudas.find((d) => d.id === c.deuda_id);
            const cat = deuda?.categoria_id ? mapaCategorias.get(deuda.categoria_id) : undefined;
            const dia = Number(c.fecha.split('-')[2]) || 1;
            itemsMes.push({
              id: `cuota-${c.id}`,
              fecha: c.fecha,
              dia,
              descripcion: `${deuda ? deuda.nombre : 'Deuda'} · Cuota #${c.numero}`,
              monto: pendiente,
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
          if (item.tipo === 'ingreso') ing1a += item.monto;
          else gas1a += item.monto;
        } else if (item.dia === 15) {
          if (item.tipo === 'ingreso') ing1b += item.monto;
          else gas1b += item.monto;
        } else if (item.dia < ultimoDia && item.dia < 30) {
          if (item.tipo === 'ingreso') ing2a += item.monto;
          else gas2a += item.monto;
        } else {
          if (item.tipo === 'ingreso') ing2b += item.monto;
          else gas2b += item.monto;
        }
      });

      // Agregar sueldos al detalle visual
      if (s15 > 0) {
        itemsMes.push({
          id: `s15-${llave}`,
          fecha: `${prefijoMes}-15`,
          dia: 15,
          descripcion: 'Sueldo Quincena (Día 15)',
          monto: s15,
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
          descripcion: `Sueldo Fin de Mes (Día ${ultimoDia})`,
          monto: s30,
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
        llave,
        anio: aCursor,
        mes: mCursor,
        label: `${NOMBRES_MESES[mCursor]} ${aCursor}`,
        labelCorto: `${MESES_CORTOS[mCursor]} ${String(aCursor).slice(-2)}`,
        ultimoDia,
        esPasado,
        esActual,
        balanceInicio,
        bolsilloAntes15,
        balanceTras15,
        bolsilloAntesFinMes,
        balanceFin,
        ingresosTotales,
        gastosTotales,
        sueldo15: s15,
        sueldo30: s30,
        items: itemsMes,
      });

      mCursor++;
      if (mCursor > 11) {
        mCursor = 0;
        aCursor++;
      }
    }

    return resultado;
  }, [montoBase, movimientos, sueldos, recurrentes, cuotas, pagosDeuda, deudas, mapaCategorias, anioHoy, mesHoy]);

  const proyeccionesVisibles = useMemo(
    () => (mostrarHistorico ? proyecciones : proyecciones.filter((p) => !p.esPasado)),
    [proyecciones, mostrarHistorico]
  );

  const cantidadMesesPasados = useMemo(
    () => proyecciones.filter((p) => p.esPasado).length,
    [proyecciones]
  );

  const kpisProyeccion = useMemo(() => {
    const futuras = proyecciones.filter((p) => !p.esPasado);
    const base = futuras.length > 0 ? futuras : proyecciones;
    if (base.length === 0) return null;

    const mejorMes = base.reduce((prev, curr) => (curr.balanceFin > prev.balanceFin ? curr : prev));
    const menorLiquidez = base.reduce((prev, curr) =>
      curr.balanceFin < prev.balanceFin ? curr : prev
    );
    const actual = base.find((p) => p.esActual) || base[0];
    const alertaDeficit = base.find((p) => p.balanceFin < 0);
    const alertaLiquidez = base.find(
      (p) => p.bolsilloAntes15 < 0 || p.balanceTras15 < 0 || p.bolsilloAntesFinMes < 0
    );

    return { mejorMes, menorLiquidez, actual, alertaDeficit, alertaLiquidez };
  }, [proyecciones]);

  const toggleMesAbierto = (llave: string) => {
    setMesesAbiertos((prev) => ({ ...prev, [llave]: !prev[llave] }));
  };

  const expandirContraerTodos = () => {
    const algunoAbierto = proyeccionesVisibles.some((p) => mesesAbiertos[p.llave]);
    const nuevoEstado: Record<string, boolean> = {};
    proyeccionesVisibles.forEach((p) => {
      nuevoEstado[p.llave] = !algunoAbierto;
    });
    setMesesAbiertos(nuevoEstado);
  };

  const ultimoDiaSueldoSeleccionado = obtenerUltimoDiaMes(sueldoAnio, sueldoMes);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* FILA SUPERIOR: Columna Izquierda (Saldo + Próximos Pagos + Gastos Categoría) y Columna Derecha (Sueldos + Proyecciones) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA (4 cols en desktop) */}
        <div className="lg:col-span-4 space-y-6">
          {/* TARJETA 1: SALDO DE REFERENCIA */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 text-white p-6 shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-300/90">
                  Saldo Inicial de Referencia
                </span>
                <span className="text-[11px] bg-white/10 px-2.5 py-0.5 rounded-full text-slate-200">
                  Base de Proyección
                </span>
              </div>

              <div className="text-3xl sm:text-4xl font-black mt-2 tracking-tight">
                {formatearMoneda(montoBase)}
              </div>

              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Punto de partida para calcular tus saldos acumulados mes a mes junto con sueldos, ingresos y gastos.
              </p>

              {!editandoBase ? (
                <button
                  onClick={() => setEditandoBase(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-all cursor-pointer border border-white/20"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Actualizar saldo base</span>
                </button>
              ) : (
                <form onSubmit={handleGuardarBase} className="mt-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      S/.
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputBase}
                      onChange={(e) => setInputBase(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/70 border border-teal-400/50 text-white text-sm font-semibold focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={guardandoBase}
                    className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs cursor-pointer transition-colors"
                  >
                    {guardandoBase ? '...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoBase(false)}
                    className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* TARJETA 2: PRÓXIMOS PAGOS PENDIENTES */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Próximos pagos</h2>
                  <p className="text-xs text-slate-500">
                    {proximosPagos.length > 0
                      ? `${proximosPagos.length} compromiso(s) pendiente(s)`
                      : 'Todo al día'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('pagos')}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Agenda</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {proximosPagos.length === 0 ? (
              <div className="text-center py-6 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 mb-2">No tienes pagos pendientes por confirmar.</p>
                <button
                  onClick={() => onNavigate('pagos')}
                  className="text-xs font-semibold text-teal-600 hover:underline cursor-pointer"
                >
                  Configurar pagos o cuotas →
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {proximosPagos.slice(0, 4).map((item) => {
                  const [y, m, d] = item.fecha.split('-');
                  return (
                    <div
                      key={item.id}
                      onClick={() => onNavigate('pagos')}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        item.vencido
                          ? 'bg-red-50/60 border-red-200 hover:bg-red-50'
                          : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center text-xs font-bold shrink-0 ${
                            item.vencido
                              ? 'bg-red-100 text-red-700'
                              : 'bg-white border border-slate-200 text-slate-800'
                          }`}
                        >
                          <span className="text-sm font-black leading-none">{d}</span>
                          <span className="text-[10px] uppercase text-slate-500">
                            {MESES_CORTOS[Number(m) - 1]}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{item.nombre}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.etiqueta} · {y}
                            {item.vencido && (
                              <span className="ml-1.5 text-red-600 font-semibold">· Vencido</span>
                            )}
                            {item.esHoy && (
                              <span className="ml-1.5 text-amber-600 font-semibold">· Hoy</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-slate-900 shrink-0 ml-2">
                        {formatearMoneda(item.monto)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TARJETA 3: GASTOS POR CATEGORÍA */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">Gastos por Categoría</h2>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={catMes}
                  onChange={(e) => setCatMes(Number(e.target.value))}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-medium text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  {MESES_CORTOS.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={catAnio}
                  onChange={(e) => setCatAnio(Number(e.target.value))}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-medium text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  {[anioHoy - 1, anioHoy, anioHoy + 1, anioHoy + 2].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Gastado en {NOMBRES_MESES[catMes]}
              </span>
              <div className="text-2xl font-black text-slate-900 mt-0.5">
                {formatearMoneda(reporteGastosCategoria.total)}
              </div>
            </div>

            {reporteGastosCategoria.items.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No hay gastos registrados en {NOMBRES_MESES[catMes]} {catAnio}.
              </div>
            ) : (
              <div className="space-y-3">
                {reporteGastosCategoria.items.map((item) => {
                  const pct =
                    reporteGastosCategoria.total > 0
                      ? Math.round((item.monto / reporteGastosCategoria.total) * 100)
                      : 0;
                  return (
                    <div key={item.nombre} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-semibold text-slate-700">{item.nombre}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">{pct}%</span>
                          <span className="font-bold text-slate-900">
                            {formatearMoneda(item.monto)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(pct, 4)}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA (8 cols en desktop): SUELDOS + PROYECCIÓN MENSUAL */}
        <div className="lg:col-span-8 space-y-6">
          {/* TARJETA 4: CONFIGURACIÓN DE SUELDOS E INGRESOS FIJOS DEL MES */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Panorama de Sueldos Mensuales
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configura tu ingreso quincenal (día 15) y/o de fin de mes (día {ultimoDiaSueldoSeleccionado})
                  </p>
                </div>
              </div>

              {/* Píldoras de modalidad */}
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setModoSueldo('quincenal')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    modoSueldo === 'quincenal'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2 Pagos (15 y Fin de Mes)
                </button>
                <button
                  type="button"
                  onClick={() => setModoSueldo('mensual')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    modoSueldo === 'mensual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1 Pago Mensual
                </button>
              </div>
            </div>

            <form onSubmit={handleGuardarSueldo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Selector Mes */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Mes
                  </label>
                  <select
                    value={sueldoMes}
                    onChange={(e) => setSueldoMes(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-500"
                  >
                    {NOMBRES_MESES.map((m, idx) => (
                      <option key={idx} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector Año */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Año
                  </label>
                  <select
                    value={sueldoAnio}
                    onChange={(e) => setSueldoAnio(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-500"
                  >
                    {[anioHoy - 1, anioHoy, anioHoy + 1, anioHoy + 2].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sueldo Día 15 */}
                {modoSueldo === 'quincenal' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Sueldo Quincena (Día 15)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        S/.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={inputSueldo15}
                        onChange={(e) => setInputSueldo15(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}

                {/* Sueldo Fin de Mes */}
                <div className={modoSueldo === 'mensual' ? 'md:col-span-2' : ''}>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Sueldo Fin de Mes (Día {ultimoDiaSueldoSeleccionado})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      S/.
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputSueldo30}
                      onChange={(e) => setInputSueldo30(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aplicarRestoAnio}
                    onChange={(e) => setAplicarRestoAnio(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    Aplicar estos montos desde <strong>{NOMBRES_MESES[sueldoMes]}</strong> hasta{' '}
                    <strong>Diciembre {sueldoAnio}</strong>
                  </span>
                </label>

                <div className="flex items-center gap-3">
                  {mensajeSueldo && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {mensajeSueldo}
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={guardandoSueldo}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    {guardandoSueldo ? 'Guardando...' : 'Guardar Sueldo'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* TARJETA 5: PROYECCIÓN MENSUAL ESTIMADA */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Proyección Mensual Estimada
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cálculo acumulado aplicando sueldos, movimientos realizados y pagos programados pendientes
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandirContraerTodos}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {proyeccionesVisibles.some((p) => mesesAbiertos[p.llave])
                    ? 'Contraer todos'
                    : 'Expandir todos'}
                </button>

                {cantidadMesesPasados > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarHistorico(!mostrarHistorico)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      mostrarHistorico
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>
                      {mostrarHistorico
                        ? `Ocultar pasados (${cantidadMesesPasados})`
                        : `Ver meses pasados (${cantidadMesesPasados})`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* KPIs DE PROYECCIÓN */}
            {kpisProyeccion && (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Mejor mes proyectado
                    </span>
                    <strong className="text-sm font-extrabold text-emerald-600 block mt-0.5">
                      {kpisProyeccion.mejorMes.label}
                    </strong>
                    <span className="text-xs font-bold text-slate-700">
                      {formatearMoneda(kpisProyeccion.mejorMes.balanceFin)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Menor liquidez
                    </span>
                    <strong
                      className={`text-sm font-extrabold block mt-0.5 ${
                        kpisProyeccion.menorLiquidez.balanceFin < 0
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {kpisProyeccion.menorLiquidez.label}
                    </strong>
                    <span className="text-xs font-bold text-slate-700">
                      {formatearMoneda(kpisProyeccion.menorLiquidez.balanceFin)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Gastos de {kpisProyeccion.actual.label}
                    </span>
                    <strong className="text-sm font-extrabold text-slate-800 block mt-0.5">
                      Mes en curso
                    </strong>
                    <span className="text-xs font-bold text-red-600">
                      -{formatearMoneda(kpisProyeccion.actual.gastosTotales)}
                    </span>
                  </div>
                </div>

                {/* Alerta de salud financiera */}
                {kpisProyeccion.alertaDeficit ? (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>
                        <strong>Saldo negativo previsto</strong> en{' '}
                        {kpisProyeccion.alertaDeficit.label} (
                        {formatearMoneda(kpisProyeccion.alertaDeficit.balanceFin)}).
                      </span>
                    </div>
                  </div>
                ) : kpisProyeccion.alertaLiquidez ? (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>Liquidez ajustada entre quincenas</strong> en{' '}
                        {kpisProyeccion.alertaLiquidez.label}.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Proyección saludable.</strong> Sin saldos negativos en los próximos 12 meses.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* CUADRÍCULA DE TARJETAS DE PROYECCIÓN POR MES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proyeccionesVisibles.map((p) => {
                const abierto = Boolean(mesesAbiertos[p.llave]);
                const tieneDeficit = p.balanceFin < 0;
                const tieneLiquidezBaja =
                  !tieneDeficit &&
                  (p.bolsilloAntes15 < 0 || p.balanceTras15 < 0 || p.bolsilloAntesFinMes < 0);

                return (
                  <div
                    key={p.llave}
                    className={`rounded-2xl border p-4 transition-all shadow-xs flex flex-col justify-between ${
                      p.esActual
                        ? 'border-teal-400 bg-teal-50/15 ring-1 ring-teal-400/30'
                        : tieneDeficit
                        ? 'border-red-300 bg-red-50/10'
                        : tieneLiquidezBaja
                        ? 'border-amber-300 bg-amber-50/10'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      {/* Cabecera del mes */}
                      <div
                        onClick={() => toggleMesAbierto(p.llave)}
                        className="flex items-center justify-between cursor-pointer select-none"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-extrabold text-slate-900">{p.label}</h3>
                            {p.esActual && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                                Actual
                              </span>
                            )}
                            {p.esPasado && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                Concluido
                              </span>
                            )}
                            {tieneDeficit && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                Déficit
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {abierto ? 'Ocultar quincenas' : 'Ver desglose quincenal'}
                          </span>
                        </div>

                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform ${
                            abierto ? 'rotate-180' : ''
                          }`}
                        />
                      </div>

                      {/* Cuerpo desplegable con los hitos del mes */}
                      {abierto && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Saldo mes anterior:</span>
                            <strong className="text-slate-900">
                              {formatearMoneda(p.balanceInicio)}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Ingresos + Sueldos:</span>
                            <strong className="text-emerald-600">
                              +{formatearMoneda(p.ingresosTotales)}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Gastos proyectados:</span>
                            <strong className="text-red-600">
                              -{formatearMoneda(p.gastosTotales)}
                            </strong>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1.5 mt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Antes del 15 (Días 1-14):</span>
                              <strong
                                className={
                                  p.bolsilloAntes15 < 0 ? 'text-red-600' : 'text-slate-800'
                                }
                              >
                                {formatearMoneda(p.bolsilloAntes15)}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Tras quincena (Día 15):</span>
                              <strong
                                className={
                                  p.balanceTras15 < 0 ? 'text-red-600' : 'text-emerald-600'
                                }
                              >
                                {formatearMoneda(p.balanceTras15)}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">
                                Antes de fin de mes (16-{p.ultimoDia - 1}):
                              </span>
                              <strong
                                className={
                                  p.bolsilloAntesFinMes < 0 ? 'text-red-600' : 'text-slate-800'
                                }
                              >
                                {formatearMoneda(p.bolsilloAntesFinMes)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pie siempre visible: Balance final del mes + Botón detalle */}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 text-white">
                        <span className="text-xs font-semibold text-slate-300">
                          Al cierre (Día {p.ultimoDia})
                        </span>
                        <strong
                          className={`text-sm font-black ${
                            p.balanceFin < 0 ? 'text-red-400' : 'text-teal-400'
                          }`}
                        >
                          {formatearMoneda(p.balanceFin)}
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => setModalDetalleMes(p)}
                        className="mt-2 w-full py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver movimientos ({p.items.length})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE DETALLE DE MOVIMIENTOS DEL MES PROYECTADO */}
      {modalDetalleMes && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-bold">{modalDetalleMes.label}</h3>
                <p className="text-xs text-slate-300">
                  Desglose completo de ingresos, sueldos, gastos y cuotas
                </p>
              </div>
              <button
                onClick={() => setModalDetalleMes(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-bold uppercase block">
                    Saldo Inicial Mes
                  </span>
                  <strong className="text-sm font-extrabold text-slate-900">
                    {formatearMoneda(modalDetalleMes.balanceInicio)}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-bold uppercase block">
                    Saldo Cierre Mes
                  </span>
                  <strong
                    className={`text-sm font-extrabold ${
                      modalDetalleMes.balanceFin < 0 ? 'text-red-600' : 'text-teal-600'
                    }`}
                  >
                    {formatearMoneda(modalDetalleMes.balanceFin)}
                  </strong>
                </div>
              </div>

              {modalDetalleMes.items.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No hay movimientos ni sueldos configurados en este mes.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {modalDetalleMes.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50/80 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0">
                          {item.dia}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{item.descripcion}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: item.categoriaColor }}
                            />
                            <span>{item.categoriaNombre}</span>
                            <span>·</span>
                            <span className="capitalize">{item.origen}</span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`font-extrabold shrink-0 ${
                          item.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {item.tipo === 'ingreso' ? '+' : '-'}
                        {formatearMoneda(item.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => {
                  setModalDetalleMes(null);
                  onNavigate('movimientos');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Ir a Movimientos</span>
              </button>
              <button
                onClick={() => setModalDetalleMes(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

