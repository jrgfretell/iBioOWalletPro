import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  Check,
  Search,
  Banknote,
  DollarSign,
  Euro,
  Layers,
  History,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { AnimatedModal } from './AnimatedModal';
import { WalletCreatedPrompt } from './WalletCreatedPrompt';
import { fechaHoyISO } from '../types/wallet';
import type { Billetera, Moneda, ActiveTab } from '../types/wallet';
import { confirmarAccion, alertaInfo, alertaError, toastExito } from '../lib/alerts';

interface BilleterasViewProps {
  onNavigate?: (tab: ActiveTab, subTab?: 'agenda' | 'cronogramas') => void;
}

export const BilleterasView: React.FC<BilleterasViewProps> = ({ onNavigate }) => {
  const {
    billeteras,
    billeteraActual,
    montoBase: montoBaseActual,
    fechaReferencia: fechaRefActual,
    loading,
    escribiendo,
    monedasDisponibles,
    monedasCargadas,
    seleccionarBilletera,
    crearBilletera,
    editarBilletera,
    archivarBilletera,
    eliminarBilletera,
  } = useWallet();

  // Estados de navegación interna
  const [tabFiltro, setTabFiltro] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de modales de creación y edición
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingWallet, setEditingWallet] = useState<Billetera | null>(null);
  const [inputNombre, setInputNombre] = useState('');
  const [inputMoneda, setInputMoneda] = useState<Moneda>('');
  const [inputMontoBase, setInputMontoBase] = useState('0');
  const [inputFechaRef, setInputFechaRef] = useState(() => fechaHoyISO());
  const [fechaRefOriginalEdicion, setFechaRefOriginalEdicion] = useState<string | null>(null);
  const [fechaRefEditada, setFechaRefEditada] = useState(false);
  const [modoSaldo, setModoSaldo] = useState<'hoy' | 'pasado'>('hoy');

  useEffect(() => {
    if (modalOpen && modalMode === 'create' && monedasCargadas && !monedasDisponibles.some(m => m.codigo === inputMoneda)) {
      setInputMoneda(monedasDisponibles[0]?.codigo || '');
    }
  }, [modalOpen, modalMode, monedasCargadas, monedasDisponibles, inputMoneda]);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Modal post-creación: invitar a configurar ingresos
  const [showPostCreatePrompt, setShowPostCreatePrompt] = useState(false);
  const [createdWalletName, setCreatedWalletName] = useState<string | null>(null);

  // Monedas presentes en billeteras activas (para evitar ruido visual de ceros)
  const monedasEnUso = useMemo(() => {
    const activas = billeteras.filter((w) => !w.archivada);
    const set = new Set<string>();
    for (const w of activas) set.add(w.moneda);
    return Array.from(set);
  }, [billeteras]);

  // Totales consolidados por moneda activa
  const patrimonioConsolidado = useMemo(() => {
    const activas = billeteras.filter((w) => !w.archivada);
    const totales: Record<string, number> = {};
    for (const w of activas) {
      const base = w.id === billeteraActual?.id ? montoBaseActual : (w.monto_base || 0);
      totales[w.moneda] = (totales[w.moneda] || 0) + base;
    }
    return {
      totales,
      totalActivas: activas.length,
      totalArchivadas: billeteras.filter((w) => w.archivada).length,
    };
  }, [billeteras, billeteraActual, montoBaseActual]);

  // Filtrado de billeteras
  const billeterasFiltradas = useMemo(() => {
    let list = billeteras;
    if (tabFiltro === 'archivadas') {
      list = list.filter((w) => w.archivada);
    } else {
      list = list.filter((w) => !w.archivada);
      if (tabFiltro !== 'todas') {
        list = list.filter((w) => w.moneda === tabFiltro);
      }
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (w) =>
          w.nombre.toLowerCase().includes(term) ||
          w.moneda.toLowerCase().includes(term)
      );
    }
    return list;
  }, [billeteras, tabFiltro, searchTerm]);

  // Handlers de Apertura de Modales
  const abrirCrear = () => {
    setModalMode('create');
    setEditingWallet(null);
    setInputNombre('');
    setInputMoneda(monedasDisponibles[0]?.codigo || '');
    setInputMontoBase('0');
    setInputFechaRef(fechaHoyISO());
    setFechaRefOriginalEdicion(null);
    setFechaRefEditada(false);
    setModoSaldo('hoy');
    setErrorModal(null);
    setModalOpen(true);
  };

  const abrirEditar = (wallet: Billetera) => {
    setModalMode('edit');
    setEditingWallet(wallet);
    setInputNombre(wallet.nombre);
    setInputMoneda(wallet.moneda);
    const isCurrent = wallet.id === billeteraActual?.id;
    const base = isCurrent ? montoBaseActual : (wallet.monto_base || 0);
    const fecha = (isCurrent ? fechaRefActual : wallet.fecha_referencia) || fechaHoyISO();
    setInputMontoBase(String(base));
    setInputFechaRef(fecha);
    setFechaRefOriginalEdicion(fecha);
    setFechaRefEditada(false);
    setModoSaldo(wallet.modo_saldo_inicial ?? (fecha < fechaHoyISO() ? 'pasado' : 'hoy'));
    setErrorModal(null);
    setModalOpen(true);
  };

  // Guardar creación o edición
  const handleGuardarBilletera = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreLimpio = inputNombre.trim();
    if (!nombreLimpio) {
      setErrorModal('El nombre de la billetera es requerido.');
      return;
    }
    const monto = parseFloat(inputMontoBase);
    const montoFinal = Number.isFinite(monto) ? monto : 0;
    const fechaFinal = modalMode === 'edit'
      ? (fechaRefEditada ? inputFechaRef : (fechaRefOriginalEdicion || inputFechaRef || fechaHoyISO()))
      : modoSaldo === 'hoy' ? fechaHoyISO() : (inputFechaRef || fechaHoyISO());

    try {
      setGuardando(true);
      setErrorModal(null);
      if (modalMode === 'create') {
        const ok = await crearBilletera(nombreLimpio, inputMoneda, montoFinal, fechaFinal, modoSaldo);
        if (ok) {
          await toastExito(`Billetera "${nombreLimpio}" creada con éxito`);
          setModalOpen(false);
          setCreatedWalletName(nombreLimpio);
          setShowPostCreatePrompt(true);
        } else {
          setErrorModal('No se pudo crear la billetera. Intenta nuevamente.');
        }
      } else if (editingWallet) {
        const ok = await editarBilletera(editingWallet.id, nombreLimpio, montoFinal, fechaFinal, modoSaldo);
        if (ok) {
          await toastExito('Billetera actualizada');
          setModalOpen(false);
        } else {
          setErrorModal('No se pudo actualizar la billetera.');
        }
      }
    } finally {
      setGuardando(false);
    }
  };

  // Archivar / Reactivar
  const handleToggleArchive = async (wallet: Billetera) => {
    const confirmado = await confirmarAccion({
      title: `¿${wallet.archivada ? 'Reactivar' : 'Archivar'} ${wallet.nombre}?`,
      text: wallet.archivada
        ? 'La billetera volverá a estar activa y visible en tus accesos rápidos.'
        : 'Conservarás todo su historial. Podrás consultarla o reactivarla cuando quieras.',
      confirmButtonText: wallet.archivada ? 'Sí, reactivar' : 'Sí, archivar',
      isDanger: false,
      icon: 'question',
    });
    if (!confirmado) return;

    const ok = await archivarBilletera(wallet.id, !wallet.archivada);
    if (ok) {
      toastExito(`Billetera ${wallet.archivada ? 'reactivada' : 'archivada'}`);
    }
  };

  // Eliminar
  const handleEliminar = async (wallet: Billetera) => {
    if (wallet.es_principal) {
      await alertaInfo('Billetera Principal', 'La billetera principal no puede ser eliminada.');
      return;
    }
    const confirmado = await confirmarAccion({
      title: `¿Eliminar ${wallet.nombre}?`,
      text: 'Esta acción es permanente. Solo se completará si la billetera no tiene movimientos ni compromisos registrados.',
      confirmButtonText: 'Sí, eliminar definitivamente',
      isDanger: true,
      icon: 'warning',
    });
    if (!confirmado) return;

    try {
      const ok = await eliminarBilletera(wallet.id);
      if (ok) {
        await toastExito(`Billetera "${wallet.nombre}" eliminada`);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo eliminar.';
      await alertaError('No se pudo eliminar', msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Principal del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 flex items-center justify-center shadow-xs">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Mis Billeteras
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Gestiona tus fondos, saldos base, monedas y perfiles de ingreso en un solo lugar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={abrirCrear}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Billetera</span>
          </button>
        </div>
      </div>

      {/* 2. KPIs de Patrimonio Consolidado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Si no hay billeteras activas, mostramos tarjeta por defecto en Soles */}
        {Object.keys(patrimonioConsolidado.totales).length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Saldo base
              </span>
              <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight block mt-0.5">
                —
              </span>
            </div>
          </div>
        )}

        {/* Tarjetas dinámicas para cada moneda con fondos activos */}
        {Object.entries(patrimonioConsolidado.totales).map(([codigo, total]) => {
          const info = monedasDisponibles.find(m => m.codigo === codigo) || { nombre: codigo, simbolo: codigo };
          const isUSD = codigo === 'USD';
          const isEUR = codigo === 'EUR';
          const isPEN = codigo === 'PEN';

          return (
            <div key={codigo} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                  isUSD
                    ? 'bg-blue-50 border-blue-100 text-blue-600'
                    : isEUR
                    ? 'bg-amber-50 border-amber-100 text-amber-600'
                    : 'bg-teal-50 border-teal-100 text-teal-600'
                }`}
              >
                {isUSD ? (
                  <DollarSign className="w-5 h-5" />
                ) : isEUR ? (
                  <Euro className="w-5 h-5" />
                ) : isPEN ? (
                  <Banknote className="w-5 h-5" />
                ) : (
                  <span className="font-bold text-sm">{info.simbolo}</span>
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block truncate">
                  Saldo base
                </span>
                <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight block mt-0.5 truncate">
                  {info.simbolo} {total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          );
        })}

        {/* Total Billeteras */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Billeteras Registradas
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {patrimonioConsolidado.totalActivas} activas
              </span>
              {patrimonioConsolidado.totalArchivadas > 0 && (
                <span className="text-xs font-semibold text-slate-400">
                  ({patrimonioConsolidado.totalArchivadas} archivadas)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Tabs de filtro dinámicas */}
        <div className="inline-flex flex-wrap p-1 bg-slate-200/60 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setTabFiltro('todas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tabFiltro === 'todas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({billeteras.filter((w) => !w.archivada).length})
          </button>

          {monedasEnUso.map((codigo) => {
            const info = monedasDisponibles.find(m => m.codigo === codigo) || { nombre: codigo, simbolo: codigo };
            const count = billeteras.filter((w) => !w.archivada && w.moneda === codigo).length;
            const isSelected = tabFiltro === codigo;
            return (
              <button
                key={codigo}
                type="button"
                onClick={() => setTabFiltro(codigo)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {info.nombre} {codigo} ({count})
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setTabFiltro('archivadas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tabFiltro === 'archivadas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Archivadas ({billeteras.filter((w) => w.archivada).length})
          </button>
        </div>

        {/* Input de Búsqueda */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o moneda..."
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 transition-all"
          />
        </div>
      </div>

      {/* 4. Parrilla de Billeteras */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {billeterasFiltradas.map((wallet) => {
          const isCurrent = wallet.id === billeteraActual?.id;
          const displayBase = isCurrent ? montoBaseActual : (wallet.monto_base || 0);
          const displayFechaRef = isCurrent ? fechaRefActual : wallet.fecha_referencia;
          const infoMoneda = monedasDisponibles.find(m => m.codigo === wallet.moneda) || { nombre: wallet.moneda, simbolo: wallet.moneda };

          return (
            <div
              key={wallet.id}
              className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                isCurrent
                  ? 'bg-gradient-to-b from-white to-teal-50/30 border-teal-400 shadow-xs ring-1 ring-teal-400/30'
                  : wallet.archivada
                  ? 'bg-slate-50 border-slate-200 opacity-70'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
              }`}
            >
              <div>
                {/* Header de la tarjeta */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider ${
                        wallet.moneda === 'USD'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : wallet.moneda === 'EUR'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : wallet.moneda === 'PEN'
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}
                    >
                      {wallet.moneda}
                    </span>
                    {wallet.es_principal && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        Principal
                      </span>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      wallet.archivada
                        ? 'bg-slate-200/80 text-slate-600'
                        : isCurrent
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        wallet.archivada
                          ? 'bg-slate-400'
                          : isCurrent
                          ? 'bg-emerald-500'
                          : 'bg-slate-300'
                      }`}
                    />
                    <span>{wallet.archivada ? 'Archivada' : isCurrent ? 'Activa' : 'Inactiva'}</span>
                  </span>
                </div>

                {/* Nombre de la Billetera */}
                <h3 className="font-bold text-slate-900 text-base mb-3 truncate">
                  {wallet.nombre}
                </h3>

                {/* Saldo Base */}
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 mb-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1">
                    <span>SALDO BASE</span>
                    {displayFechaRef && (
                      <span>
                        Corte: {displayFechaRef.split('-').reverse().join('/')}
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-bold text-slate-900 tracking-tight">
                    {infoMoneda.simbolo} {displayBase.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                      <Check className="w-3.5 h-3.5 text-teal-600" />
                      <span>Billetera en uso</span>
                    </span>
                  ) : wallet.archivada ? (
                    <span className="text-xs text-slate-400 italic">Archivada</span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading || escribiendo}
                      onClick={() => seleccionarBilletera(wallet.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Usar esta billetera
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirEditar(wallet)}
                    title="Editar nombre y saldo base"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleArchive(wallet)}
                    title={wallet.archivada ? 'Reactivar billetera' : 'Archivar billetera'}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      wallet.archivada
                        ? 'text-amber-600 hover:bg-amber-100/60'
                        : 'text-slate-400 hover:text-amber-600 hover:bg-slate-200/60'
                    }`}
                  >
                    {wallet.archivada ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>

                  {!wallet.es_principal && (
                    <button
                      type="button"
                      onClick={() => handleEliminar(wallet)}
                      title="Eliminar billetera definitivamente"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {billeterasFiltradas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-500">
            No hay billeteras para este filtro.
          </p>
        </div>
      )}

      {/* 5. Modal de Creación / Edición de Billetera */}
      <AnimatedModal
        open={modalOpen}
        label={modalMode === 'create' ? 'Nueva Billetera' : 'Editar Billetera'}
      >
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl relative overflow-hidden">
          <div className="grid md:grid-cols-[minmax(0,1.35fr)_minmax(230px,.8fr)]">
          <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-slate-900">
                  {modalMode === 'create' ? 'Crea un perfil para tu dinero' : 'Edita tu perfil de dinero'}
                </h3>
                <p className="text-xs text-slate-500">
                  {modalMode === 'create'
                    ? 'Elige la moneda y define desde qué saldo quieres comenzar.'
                    : 'Actualiza el nombre y el saldo inicial de referencia.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleGuardarBilletera} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nombre de la billetera
              </label>
              <input
                type="text"
                required
                value={inputNombre}
                onChange={(e) => setInputNombre(e.target.value)}
                placeholder="Ej. Personal, Ahorros o Viajes"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>

            {(
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Moneda</label>
                  <span className="text-[11px] font-semibold text-slate-400">{modalMode === 'create' ? 'Según el catálogo activo' : 'No se puede cambiar después de crearla'}</span>
                </div>
                <div className={`grid gap-2 pr-0.5 ${modalMode === 'create' ? 'max-h-40 grid-cols-2 overflow-y-auto sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
                  {(modalMode === 'create'
                    ? monedasDisponibles.filter((m) => m.activo !== false)
                    : [monedasDisponibles.find((m) => m.codigo === editingWallet?.moneda) || { codigo: editingWallet?.moneda || inputMoneda, nombre: editingWallet?.moneda || inputMoneda, simbolo: editingWallet?.moneda || inputMoneda }]
                  ).map((m) => {
                    const isSelected = inputMoneda === m.codigo;

                    return (
                      <button
                        key={m.codigo}
                        type="button"
                        disabled={modalMode === 'edit'}
                        onClick={() => setInputMoneda(m.codigo)}
                        aria-pressed={isSelected}
                        className={`min-h-[58px] rounded-xl border px-3 py-2 text-left flex items-center gap-2.5 transition-all ${modalMode === 'create' ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-800 ring-2 ring-teal-500/10'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold">{m.simbolo}</span>
                        <span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{m.nombre}</span><span className="mt-0.5 block text-[11px] text-slate-400">{m.codigo}</span></span>
                      </button>
                    );
                  })}
                </div>
                {modalMode === 'create' && monedasCargadas && monedasDisponibles.filter(m => m.activo !== false).length === 0 && (
                  <p className="mt-2 text-sm text-rose-700">No hay monedas activas en el catálogo de la aplicación.</p>
                )}
              </div>
            )}

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Saldo inicial de referencia</span>
                  <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">Base de proyección</span>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">¿Cómo deseas definir tu saldo inicial?</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" aria-pressed={modoSaldo === 'hoy'} onClick={() => { setModoSaldo('hoy'); if (modalMode === 'create') setInputFechaRef(fechaHoyISO()); }} className={`flex min-h-[76px] items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${modoSaldo === 'hoy' ? 'border-teal-500 bg-white ring-2 ring-teal-500/20 shadow-sm' : 'border-slate-200 bg-white/70 hover:bg-white'}`}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${modoSaldo === 'hoy' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Wallet className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-900">Dinero disponible HOY <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">Recomendado</span></span><span className="mt-0.5 block text-[11px] leading-snug text-slate-500">Lo que tienes en mano o cuenta ahora mismo.</span></span>
                  </button>
                  <button type="button" aria-pressed={modoSaldo === 'pasado'} onClick={() => setModoSaldo('pasado')} className={`flex min-h-[76px] items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${modoSaldo === 'pasado' ? 'border-teal-500 bg-white ring-2 ring-teal-500/20 shadow-sm' : 'border-slate-200 bg-white/70 hover:bg-white'}`}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${modoSaldo === 'pasado' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}><History className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block text-xs font-semibold text-slate-900">Capital inicial en el PASADO</span><span className="mt-0.5 block text-[11px] leading-snug text-slate-500">Reconstruye tu saldo descontando pagos históricos.</span></span>
                  </button>
                </div>
                {modalMode === 'edit' && (
                  <div className="rounded-xl border border-teal-200/80 bg-teal-50 p-2.5 text-xs leading-relaxed text-teal-900">
                    <strong>Fecha de referencia guardada: {new Intl.DateTimeFormat('es-PE').format(new Date(`${(fechaRefOriginalEdicion || inputFechaRef)}T12:00:00`))}.</strong> Se conserva al editar el nombre o el saldo. Solo cambiará si eliges “Capital inicial en el PASADO” y modificas explícitamente la fecha.
                  </div>
                )}
                {modoSaldo === 'hoy' ? (
                  <>
                    <label htmlFor="wallet-base-amount" className="mb-1 block text-xs font-semibold text-slate-600">Saldo disponible ({monedasDisponibles.find(m => m.codigo === inputMoneda)?.simbolo || inputMoneda})</label>
                    <input id="wallet-base-amount" type="number" min="0" step="0.01" required value={inputMontoBase} onChange={(e) => setInputMontoBase(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" />
                    {modalMode === 'create' && (
                      <div className="rounded-xl border border-teal-200/80 bg-teal-50 p-2.5 text-xs leading-relaxed text-teal-900"><strong>✓ Punto de partida: Hoy ({new Intl.DateTimeFormat('es-PE').format(new Date(`${fechaHoyISO()}T12:00:00`))}).</strong> Si registras compromisos o cuotas que pagaste meses atrás, <strong>no se descontarán</strong> de este dinero. Solo se descontarán pagos desde hoy en adelante.</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div><label htmlFor="wallet-base-amount" className="mb-1 block min-h-8 text-xs font-semibold leading-4 text-slate-600">Capital inicial ({monedasDisponibles.find(m => m.codigo === inputMoneda)?.simbolo || inputMoneda})</label><input id="wallet-base-amount" type="number" min="0" step="0.01" required value={inputMontoBase} onChange={(e) => setInputMontoBase(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></div>
                      <div><label htmlFor="wallet-base-date" className="mb-1 block min-h-8 text-xs font-semibold leading-4 text-slate-600">¿En qué fecha tenías este capital?</label><input id="wallet-base-date" type="date" required max={fechaHoyISO()} value={inputFechaRef} onChange={(e) => { setInputFechaRef(e.target.value); if (modalMode === 'edit') setFechaRefEditada(true); }} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></div>
                    </div>
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900"><strong>Reconstrucción histórica:</strong> Los abonos de cuotas y gastos posteriores a <strong>{inputFechaRef ? new Intl.DateTimeFormat('es-PE').format(new Date(`${inputFechaRef}T12:00:00`)) : 'la fecha elegida'}</strong> se irán restando mes a mes hasta calcular cuánto dinero te queda actualmente.</div>
                  </>
                )}
              </section>

            {errorModal && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {errorModal}
              </div>
            )}

            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-slate-100 bg-white/95 pt-3 pb-1 backdrop-blur">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || (modalMode === 'create' && (!monedasCargadas || !monedasDisponibles.some(m => m.codigo === inputMoneda && m.activo !== false)))}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                {guardando ? 'Guardando…' : modalMode === 'create' ? 'Crear Billetera' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
          </div>
          <aside className="hidden flex-col border-l border-slate-100 bg-slate-50 p-5 md:flex">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{modalMode === 'create' ? 'Así se verá tu billetera' : 'Vista previa de los cambios'}</span>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700"><Wallet className="h-4 w-4" /></span><span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{inputMoneda || '—'}</span></div>
              <p className="mt-4 break-words text-sm font-bold text-slate-900">{inputNombre.trim() || 'Nombre de billetera'}</p>
              <p className="mt-1 text-[11px] text-slate-400">{monedasDisponibles.find(m => m.codigo === inputMoneda)?.nombre || 'Moneda'}</p>
              <div className="my-4 h-px bg-slate-100" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Saldo inicial · {modalMode === 'edit' ? 'Referencia guardada' : modoSaldo === 'pasado' ? 'Fecha pasada' : 'Hoy'}</span>
              <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{monedasDisponibles.find(m => m.codigo === inputMoneda)?.simbolo || ''} {new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(inputMontoBase) || 0)}</p>
              {(modalMode === 'edit' || modoSaldo === 'pasado') && <p className="mt-1 text-[11px] text-slate-500">Fecha de referencia: {inputFechaRef ? new Intl.DateTimeFormat('es-PE').format(new Date(`${inputFechaRef}T12:00:00`)) : '—'}</p>}
            </div>
            <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500"><strong className="text-slate-700">Tu saldo es el punto de partida.</strong> Puedes completar tus ingresos después para obtener proyecciones más precisas.</div>
          </aside>
          </div>
        </div>
      </AnimatedModal>

      {/* 6. Modal Informativo Post-Creación de Billetera */}
      <WalletCreatedPrompt
        open={showPostCreatePrompt}
        walletName={createdWalletName}
        onDismiss={() => {
          setShowPostCreatePrompt(false);
          setCreatedWalletName(null);
        }}
        onConfigureIncome={() => {
          setShowPostCreatePrompt(false);
          setCreatedWalletName(null);
          onNavigate?.('ingresos');
        }}
      />
    </div>
  );
};
