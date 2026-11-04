import { AnimatedModal } from './AnimatedModal';
import { AnimatedDisclosure } from './AnimatedDisclosure';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import {
  NOMBRES_MESES,
  fechaHoyISO,
  fechaRealMovimiento,
} from '../types/wallet';
import type { MovimientoAgenda } from '../types/wallet';
import { confirmarAccion, toastExito } from '../lib/alerts';
import {
  Plus,
  Search,
  Filter,
  ArrowUpCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';

export const MovimientosView: React.FC = () => {
  const { error: errorBilletera, reportarError, soloLectura, formatearMoneda, simboloMoneda, clienteBilletera: supabase, soporteEtapa5, ejecutarOperacion } = useWallet();
  const { user } = useAuth();
  const { movimientos, categorias, recargarTodo, fechaReferencia, pagosDeuda } = useWallet();

  const hoy = new Date();
  const [filtroMes, setFiltroMes] = useState<number>(hoy.getMonth()); // -1 = Todos
  const [filtroAnio, setFiltroAnio] = useState<number>(hoy.getFullYear()); // -1 = Todos
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'ingreso' | 'gasto'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState<number>(-1);
  const [busqueda, setBusqueda] = useState<string>('');
  const [expandirFiltros, setExpandirFiltros] = useState<boolean>(false);

  const filtrosActivos =
    (filtroMes !== hoy.getMonth() ? 1 : 0) +
    (filtroAnio !== hoy.getFullYear() ? 1 : 0) +
    (filtroTipo !== 'todos' ? 1 : 0) +
    (filtroCategoria !== -1 ? 1 : 0);

  const resetearFiltros = () => {
    setBusqueda('');
    setFiltroMes(hoy.getMonth());
    setFiltroAnio(hoy.getFullYear());
    setFiltroTipo('todos');
    setFiltroCategoria(-1);
  };

  // Estado del formulario / modal de creación o edición
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [descripcion, setDescripcion] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [fecha, setFecha] = useState<string>(fechaHoyISO());
  const [categoriaId, setCategoriaId] = useState<number | ''>('');
  const [pagoConfirmado, setPagoConfirmado] = useState<boolean>(true);
  const [guardando, setGuardando] = useState<boolean>(false);

  useWalletFormGuard(modalAbierto, 'Movimiento');

  const mapaCategorias = useMemo(() => {
    const map = new Map<number, { nombre: string; color: string; icono: string }>();
    categorias.forEach((c) => map.set(c.id, { nombre: c.nombre, color: c.color, icono: c.icono }));
    return map;
  }, [categorias]);

  const abrirNuevo = (tipoInicial: 'gasto' | 'ingreso' = 'gasto') => {
    setEditandoId(null);
    setTipo(tipoInicial);
    setDescripcion('');
    setMonto('');
    setFecha(fechaHoyISO());
    setCategoriaId(categorias[0]?.id ?? '');
    setPagoConfirmado(true);
    setModalAbierto(true);
  };

  const abrirEdicion = (m: MovimientoAgenda) => {
    setEditandoId(m.id);
    setTipo(m.tipo);
    setDescripcion(m.descripcion);
    setMonto(String(m.monto));
    setFecha(m.fecha);
    setCategoriaId(m.categoria_id ?? (categorias[0]?.id ?? ''));
    setPagoConfirmado(m.pago_confirmado);
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    try {
    e.preventDefault();
    if (!user) return;
    const montoNum = parseFloat(monto);
    if (!descripcion.trim() || isNaN(montoNum) || montoNum <= 0 || !fecha) return;

    setGuardando(true);
    try {
      const payload = {
        user_id: user.id,
        tipo,
        descripcion: descripcion.trim(),
        monto: montoNum,
        fecha,
        categoria_id: categoriaId === '' ? null : Number(categoriaId),
        pago_confirmado: pagoConfirmado,
        fecha_pago: pagoConfirmado ? fecha : null,
      };

      if (editandoId) {
        await supabase
          .from('movimientos_agenda')
          .update(payload)
          .eq('id', editandoId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('movimientos_agenda').insert(payload);
      }

      await recargarTodo();
      setModalAbierto(false);
    } finally {
      setGuardando(false);
    }

    } catch (error) { reportarError(error); }
  };

  const handleToggleConfirmado = async (m: MovimientoAgenda) => {
    try {
    if (!user) return;
    const nuevoEstado = !m.pago_confirmado;
    await supabase
      .from('movimientos_agenda')
      .update({
        pago_confirmado: nuevoEstado,
        fecha_pago: nuevoEstado ? fechaHoyISO() : null,
      })
      .eq('id', m.id)
      .eq('user_id', user.id);
    await recargarTodo();

    } catch (error) { reportarError(error); }
  };

  const handleEliminar = async (id: number) => {
    try {
      if (!user) return;
      const pagoVinculado = pagosDeuda.find((p) => p.movimiento_id === id);

      const confirmado = await confirmarAccion({
        title: pagoVinculado ? '¿Eliminar abono de cronograma?' : '¿Eliminar movimiento?',
        text: pagoVinculado
          ? 'Se retirará este registro de tu historial y se anulará el abono de la cuota correspondiente.'
          : 'Se retirará permanentemente de tu historial.',
        confirmButtonText: 'Sí, eliminar',
        isDanger: true,
      });
      if (!confirmado) return;

      if (soporteEtapa5 && pagoVinculado) {
        const datos = { pago_id: pagoVinculado.id };
        const solicitud = crypto.randomUUID();
        await ejecutarOperacion('anular_abono', datos, solicitud);
        toastExito('Abono eliminado con éxito');
      } else {
        await supabase.from('movimientos_agenda').delete().eq('id', id).eq('user_id', user.id);
        await recargarTodo();
        toastExito('Movimiento eliminado');
      }
    } catch (error) {
      reportarError(error);
    }
  };

  // Filtrado de movimientos
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (!m.fecha) return false;
      const [y, month] = fechaRealMovimiento(m).split('-').map(Number);
      const mIdx = month - 1;

      if (filtroAnio !== -1 && y !== filtroAnio) return false;
      if (filtroMes !== -1 && mIdx !== filtroMes) return false;
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (filtroCategoria !== -1 && m.categoria_id !== filtroCategoria) return false;
      if (
        busqueda.trim() &&
        !m.descripcion.toLowerCase().includes(busqueda.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [movimientos, filtroAnio, filtroMes, filtroTipo, filtroCategoria, busqueda]);

  // Resumen del periodo filtrado
  const resumenPeriodo = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    movimientosFiltrados.forEach((m) => {
      if (m.tipo === 'ingreso') ingresos += m.monto;
      else gastos += m.monto;
    });
    return {
      ingresos,
      gastos,
      balance: ingresos - gastos,
    };
  }, [movimientosFiltrados]);

  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>([
      hoy.getFullYear() - 1,
      hoy.getFullYear(),
      hoy.getFullYear() + 1,
    ]);
    movimientos.forEach((m) => {
      if (m.fecha) {
        const y = Number(fechaRealMovimiento(m).split('-')[0]);
        if (!isNaN(y)) set.add(y);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [movimientos, hoy]);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Cabecera y botones de acción rápida */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Historial de Movimientos</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registra y administra todos tus ingresos y gastos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={soloLectura}
            onClick={() => abrirNuevo('ingreso')}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>+ Ingreso</span>
          </button>
          <button
            disabled={soloLectura}
            onClick={() => abrirNuevo('gasto')}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>+ Gasto</span>
          </button>
        </div>
      </div>

      {/* Balance Strip compacto (3 en 1 - Estilo Fintech) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
          <div className="px-1 sm:px-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
              Ingresos
            </span>
            <div className="text-sm sm:text-lg font-black text-emerald-600 mt-0.5 truncate">
              +{formatearMoneda(resumenPeriodo.ingresos)}
            </div>
          </div>

          <div className="px-1 sm:px-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-500 block">
              Gastos
            </span>
            <div className="text-sm sm:text-lg font-black text-red-600 mt-0.5 truncate">
              -{formatearMoneda(resumenPeriodo.gastos)}
            </div>
          </div>

          <div className="px-1 sm:px-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Flujo Neto
            </span>
            <div
              className={`text-sm sm:text-lg font-black mt-0.5 truncate ${
                resumenPeriodo.balance < 0 ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {formatearMoneda(resumenPeriodo.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Inteligente */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
        <div className="flex items-center gap-2">
          {/* Búsqueda rápida */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar movimiento..."
              className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 font-medium"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botón toggle de filtros avanzados */}
          <button
            type="button"
            onClick={() => setExpandirFiltros(!expandirFiltros)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border shrink-0 ${
              expandirFiltros || filtrosActivos > 0
                ? 'bg-teal-50 border-teal-200 text-teal-800'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-teal-600" />
            <span>Filtros</span>
            {filtrosActivos > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-600 text-white text-[9px] font-black flex items-center justify-center">
                {filtrosActivos}
              </span>
            )}
          </button>
        </div>

        {/* Panel de filtros desplegable */}
        <AnimatedDisclosure open={expandirFiltros || filtrosActivos > 0} id="filtros-movimientos">
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Mes */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Mes
                </label>
                <select
                  value={filtroMes}
                  onChange={(e) => setFiltroMes(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  <option value={-1}>Todos los meses</option>
                  {NOMBRES_MESES.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Año */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Año
                </label>
                <select
                  value={filtroAnio}
                  onChange={(e) => setFiltroAnio(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  <option value={-1}>Todos los años</option>
                  {aniosDisponibles.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Tipo
                </label>
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value as 'todos' | 'ingreso' | 'gasto')}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  <option value="todos">Todos los tipos</option>
                  <option value="gasto">Solo Gastos</option>
                  <option value="ingreso">Solo Ingresos</option>
                </select>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Categoría
                </label>
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  <option value={-1}>Todas las categorías</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtrosActivos > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={resetearFiltros}
                  className="text-[11px] font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
                >
                  Restablecer filtros por defecto
                </button>
              </div>
            )}
          </div>
        </AnimatedDisclosure>
      </div>

      {/* Lista de Movimientos con Formato Bancario */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {movimientosFiltrados.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm font-semibold text-slate-500">
              No se encontraron movimientos para los filtros seleccionados.
            </p>
            <button
              disabled={soloLectura}
              onClick={() => abrirNuevo('gasto')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:underline cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar tu primer movimiento</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {movimientosFiltrados.map((m) => {
              const cat = m.categoria_id ? mapaCategorias.get(m.categoria_id) : undefined;
              const catNombre = cat ? cat.nombre : 'Otros';
              const catColor = cat ? cat.color : '#0d9488';
              const vinculado = pagosDeuda.some((p) => p.movimiento_id === m.id);
              const incluido = !!fechaReferencia && m.pago_confirmado && fechaRealMovimiento(m) <= fechaReferencia;
              const [, month, d] = fechaRealMovimiento(m).split('-');

              return (
                <div
                  key={m.id}
                  className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Izquierda: Avatar de categoría + Textos con jerarquía */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: `${catColor}15`,
                        borderColor: `${catColor}30`,
                        color: catColor,
                      }}
                    >
                      <i className={`fas ${cat?.icono || 'fa-tag'} text-sm`}></i>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                          {m.descripcion}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-500">
                          {d} {NOMBRES_MESES[Number(month) - 1]?.slice(0, 3)}
                        </span>
                        <span>·</span>
                        <span
                          className="font-bold px-1.5 py-0.2 rounded text-[10px]"
                          style={{
                            backgroundColor: `${catColor}12`,
                            color: catColor,
                          }}
                        >
                          {catNombre}
                        </span>
                        {incluido && (
                          <span className="text-teal-700 font-medium">· En saldo base</span>
                        )}
                        {vinculado && (
                          <span className="text-slate-500 font-medium">· Cuota</span>
                        )}
                        <button
                          disabled={soloLectura || vinculado}
                          onClick={() => handleToggleConfirmado(m)}
                          className={`inline-flex items-center gap-0.5 font-bold cursor-pointer text-[10px] ${
                            m.pago_confirmado ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                          title="Clic para alternar Confirmado / Pendiente"
                        >
                          {m.pago_confirmado ? (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Pagado</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              <span>Pendiente</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Derecha: Monto y Acciones compactas */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span
                      className={`text-xs sm:text-sm font-black whitespace-nowrap ${
                        m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {m.tipo === 'ingreso' ? '+' : '-'}
                      {formatearMoneda(m.monto)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        disabled={soloLectura || vinculado}
                        onClick={() => abrirEdicion(m)}
                        className="p-1 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={soloLectura}
                        onClick={() => handleEliminar(m.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-30"
                        title={vinculado ? 'Eliminar abono de cronograma' : 'Eliminar'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL PARA CREAR / EDITAR MOVIMIENTO */}
      <AnimatedModal open={Boolean(modalAbierto)} label="Registrar o editar movimiento">
      {modalAbierto && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            {errorBilletera && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{errorBilletera}</p>}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editandoId ? 'Editar Movimiento' : 'Nuevo Movimiento'}
              </h3>
              <button
                onClick={() => setModalAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-5 space-y-4">
              {/* Selector de Tipo */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTipo('gasto')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tipo === 'gasto'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Gasto (-)
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('ingreso')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tipo === 'ingreso'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ingreso (+)
                </button>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  required
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. Supermercado, Cena, Bono..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Monto y Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Monto ({simboloMoneda})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Categoría
                </label>
                <select
                  value={categoriaId}
                  onChange={(e) =>
                    setCategoriaId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Estado confirmado */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pagoConfirmado}
                  onChange={(e) => setPagoConfirmado(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Movimiento ya realizado / pagado
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={soloLectura || (guardando)}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
      )}
      </AnimatedModal>
    </div>
  );
};

