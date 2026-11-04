import { calcularProyeccionBilletera } from '../lib/projection';
import type { ProyeccionMesCalculada } from '../lib/projection';
import { AnimatedModal } from './AnimatedModal';
import React, { useState, useMemo } from 'react';
import { AnimatedDisclosure } from './AnimatedDisclosure';
import { useWallet } from '../context/WalletContext';
import {
  NOMBRES_MESES,
  MESES_CORTOS,
  fechaHoyISO,
  fechaRealMovimiento,
} from '../types/wallet';
import type { ActiveTab } from '../types/wallet';
import {
  PieChart,
  TrendingUp,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  Eye,
  X,
  PlusCircle,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { billeteraActual, modoLegacy, fechaReferencia, formatearMoneda } = useWallet();
  const {
    montoBase,
    categorias,
    sueldos,
    recurrentes,
    movimientos,
    deudas,
    cuotas,
    pagosDeuda,
  } = useWallet();

  const hoy = new Date();
  const anioHoy = hoy.getFullYear();
  const mesHoy = hoy.getMonth();
  const fechaHoyStr = fechaHoyISO();


  // Estado para Gastos por Categoría
  const [catMes, setCatMes] = useState<number>(mesHoy);
  const [catAnio, setCatAnio] = useState<number>(anioHoy);

  // Estado para Proyecciones (todas las tarjetas inician colapsadas)
  const [mostrarHistorico, setMostrarHistorico] = useState<boolean>(false);
  const [mesesAbiertos, setMesesAbiertos] = useState<Record<string, boolean>>({});
  const [modalDetalleMes, setModalDetalleMes] = useState<ProyeccionMesCalculada | null>(null);




  // Mapa rápido de categorías
  const mapaCategorias = useMemo(() => {
    const map = new Map<number, { nombre: string; color: string }>();
    categorias.forEach((c) => map.set(c.id, { nombre: c.nombre, color: c.color }));
    return map;
  }, [categorias]);

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
        if (!deuda) return;
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
      if (m.tipo !== 'gasto' || !m.fecha || !m.pago_confirmado) return false;
      const [y, month] = fechaRealMovimiento(m).split('-').map(Number);
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
    if (!billeteraActual) return [];
    return calcularProyeccionBilletera({ billetera: billeteraActual, modoLegacy, hoy: fechaHoyStr,
      montoBase, fechaReferencia, categorias, movimientos, sueldos, recurrentes, cuotas, pagosDeuda, deudas });
  }, [billeteraActual, modoLegacy, fechaReferencia, fechaHoyStr, montoBase, categorias, movimientos, sueldos, recurrentes, cuotas, pagosDeuda, deudas]);

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
      (p) => (p.antes15Disponible&&p.bolsilloAntes15 < 0) || (p.tras15Disponible&&p.balanceTras15 < 0) || (p.antesFinDisponible&&p.bolsilloAntesFinMes < 0)
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


  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* FILA SUPERIOR: Columna Izquierda (Saldo + Próximos Pagos + Gastos Categoría) y Columna Derecha (Proyecciones) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA (4 cols en desktop) */}
        <div className="lg:col-span-4 space-y-6">

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

        {/* COLUMNA DERECHA (8 cols en desktop): PROYECCIÓN MENSUAL */}
        <div className="lg:col-span-8 space-y-6">
          {/* TARJETA 5: PROYECCIÓN MENSUAL ESTIMADA */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                    Proyección Mensual Estimada
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{billeteraActual?.moneda}</span>
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
                      Gastos por aplicar · {kpisProyeccion.actual.label}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {proyeccionesVisibles.map((p) => {
                const abierto = Boolean(mesesAbiertos[p.llave]);
                const tieneDeficit = p.balanceFin < 0;
                const tieneLiquidezBaja =
                  !tieneDeficit &&
                  (p.bolsilloAntes15 < 0 || p.balanceTras15 < 0 || p.bolsilloAntesFinMes < 0);

                return (
                  <div
                    key={p.llave}
                    className={`rounded-2xl border p-4 transition-all shadow-xs flex flex-col ${
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
                      <button
                        type="button"
                        aria-expanded={abierto}
                        aria-controls={`proyeccion-${p.llave}`}
                        aria-label={`${p.label}: ${abierto ? 'ocultar' : 'ver'} desglose quincenal`}
                        onClick={() => toggleMesAbierto(p.llave)}
                        className="flex w-full items-center justify-between text-left cursor-pointer select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
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
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${
                            abierto ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/* Cuerpo desplegable con los hitos del mes */}
                      <AnimatedDisclosure open={abierto} id={`proyeccion-${p.llave}`}>
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-slate-600">
                            <span>{fechaReferencia?.startsWith(`${p.anio}-${String(p.mes+1).padStart(2,'0')}`)?'Saldo de referencia:':'Saldo mes anterior:'}</span>
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
                                {p.antes15Disponible?formatearMoneda(p.bolsilloAntes15):'—'}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Tras quincena (Día 15):</span>
                              <strong
                                className={
                                  p.balanceTras15 < 0 ? 'text-red-600' : 'text-emerald-600'
                                }
                              >
                                {p.tras15Disponible?formatearMoneda(p.balanceTras15):'—'}
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
                                {p.antesFinDisponible?formatearMoneda(p.bolsilloAntesFinMes):'—'}
                              </strong>
                            </div>
                          </div>
                          {(!p.antes15Disponible||!p.tras15Disponible||!p.antesFinDisponible)&&<p className="mt-2 text-[10px] text-slate-500">— Tramo anterior al saldo de referencia; no se reconstruye su saldo.</p>}
                        </div>
                      </AnimatedDisclosure>
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
      <AnimatedModal open={Boolean(modalDetalleMes)} label="Detalle mensual">
      {modalDetalleMes && (
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
                    {fechaReferencia?.startsWith(`${modalDetalleMes.anio}-${String(modalDetalleMes.mes+1).padStart(2,'0')}`)?'Saldo de referencia':'Saldo Inicial Mes'}
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
                      className="p-3 flex flex-col items-stretch sm:flex-row sm:items-center justify-between gap-2 bg-white hover:bg-slate-50/80 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0">
                          {item.dia}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 break-words">{item.descripcion}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: item.categoriaColor }}
                            />
                            <span>{item.categoriaNombre}</span>
                            <span>·</span>
                            <span className="capitalize">{item.origen}</span>
                          </div>
                          {item.vencimientoOriginal&&<p className="mt-1 text-[11px] text-slate-500">Venció: {item.vencimientoOriginal.split('-').reverse().join('/')}</p>}
                        </div>
                      </div>
                      <span
                        className={`font-extrabold shrink-0 self-end sm:self-center ${
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
      )}
      </AnimatedModal>
    </div>
  );
};

