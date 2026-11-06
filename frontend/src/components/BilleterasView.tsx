import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  Check,
  Search,
  HelpCircle,
  Banknote,
  DollarSign,
  Layers,
  ArrowRight,
  Sparkles,
  X,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { AnimatedModal } from './AnimatedModal';
import { OnboardingModal } from './OnboardingModal';
import { MONEDAS, fechaHoyISO } from '../types/wallet';
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
    seleccionarBilletera,
    crearBilletera,
    editarBilletera,
    archivarBilletera,
    eliminarBilletera,
  } = useWallet();

  // Estados de navegación interna
  const [tabFiltro, setTabFiltro] = useState<'todas' | 'PEN' | 'USD' | 'archivadas'>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Estados de modales de creación y edición
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingWallet, setEditingWallet] = useState<Billetera | null>(null);
  const [inputNombre, setInputNombre] = useState('');
  const [inputMoneda, setInputMoneda] = useState<Moneda>('PEN');
  const [inputMontoBase, setInputMontoBase] = useState('0');
  const [inputFechaRef, setInputFechaRef] = useState(() => fechaHoyISO());
  const [modoSaldo, setModoSaldo] = useState<'hoy' | 'pasado'>('hoy');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Modal post-creación: invitar a configurar ingresos
  const [showPostCreatePrompt, setShowPostCreatePrompt] = useState(false);
  const [createdWalletName, setCreatedWalletName] = useState<string | null>(null);

  // Totales consolidados por moneda
  const patrimonioConsolidado = useMemo(() => {
    const activas = billeteras.filter((w) => !w.archivada);
    const totalPEN = activas
      .filter((w) => w.moneda === 'PEN')
      .reduce((acc, w) => acc + (w.id === billeteraActual?.id ? montoBaseActual : (w.monto_base || 0)), 0);
    const totalUSD = activas
      .filter((w) => w.moneda === 'USD')
      .reduce((acc, w) => acc + (w.id === billeteraActual?.id ? montoBaseActual : (w.monto_base || 0)), 0);
    return {
      totalPEN,
      totalUSD,
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
      if (tabFiltro === 'PEN') list = list.filter((w) => w.moneda === 'PEN');
      if (tabFiltro === 'USD') list = list.filter((w) => w.moneda === 'USD');
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
    setInputMoneda('PEN');
    setInputMontoBase('0');
    setInputFechaRef(fechaHoyISO());
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
    setModoSaldo(fecha < fechaHoyISO() ? 'pasado' : 'hoy');
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
    const fechaFinal = modoSaldo === 'hoy' ? fechaHoyISO() : (inputFechaRef || fechaHoyISO());

    try {
      setGuardando(true);
      setErrorModal(null);
      if (modalMode === 'create') {
        const ok = await crearBilletera(nombreLimpio, inputMoneda, montoFinal, fechaFinal);
        if (ok) {
          await toastExito(`Billetera "${nombreLimpio}" creada con éxito`);
          setModalOpen(false);
          setCreatedWalletName(nombreLimpio);
          setShowPostCreatePrompt(true);
        } else {
          setErrorModal('No se pudo crear la billetera. Intenta nuevamente.');
        }
      } else if (editingWallet) {
        const ok = await editarBilletera(editingWallet.id, nombreLimpio, montoFinal, fechaFinal);
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
      {/* Onboarding Guide Modal */}
      <OnboardingModal
        forceOpenGuide={showGuide}
        onCloseGuide={() => setShowGuide(false)}
      />

      {/* 1. Header Principal del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 flex items-center justify-center shadow-xs">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
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
            onClick={() => setShowGuide(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>Guía de Billeteras</span>
          </button>
          <button
            type="button"
            onClick={abrirCrear}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Billetera</span>
          </button>
        </div>
      </div>

      {/* 2. KPIs de Patrimonio Consolidado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Soles */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Patrimonio Base en Soles
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight block mt-0.5">
              S/ {patrimonioConsolidado.totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Dólares */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Patrimonio Base en Dólares
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight block mt-0.5">
              US$ {patrimonioConsolidado.totalUSD.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Total Billeteras */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Billeteras Registradas
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
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
        {/* Tabs de filtro */}
        <div className="inline-flex p-1 bg-slate-200/60 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setTabFiltro('todas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tabFiltro === 'todas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({billeteras.filter((w) => !w.archivada).length})
          </button>
          <button
            type="button"
            onClick={() => setTabFiltro('PEN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tabFiltro === 'PEN'
                ? 'bg-white text-teal-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Soles PEN
          </button>
          <button
            type="button"
            onClick={() => setTabFiltro('USD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tabFiltro === 'USD'
                ? 'bg-white text-blue-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dólares USD
          </button>
          <button
            type="button"
            onClick={() => setTabFiltro('archivadas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
          const infoMoneda = MONEDAS[wallet.moneda] || MONEDAS.PEN;

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
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-wider ${
                        wallet.moneda === 'USD'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}
                    >
                      {wallet.moneda}
                    </span>
                    {wallet.es_principal && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        Principal
                      </span>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                <h3 className="font-extrabold text-slate-900 text-base mb-3 truncate">
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
                  <div className="text-lg font-black text-slate-900 tracking-tight">
                    {infoMoneda.simbolo} {displayBase.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700">
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
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-xs font-bold transition-colors cursor-pointer"
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
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl relative">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {modalMode === 'create' ? 'Crear Nueva Billetera' : 'Editar Billetera'}
                </h3>
                <p className="text-xs text-slate-500">
                  {modalMode === 'create'
                    ? 'Organiza tus finanzas en una cuenta separada.'
                    : 'Ajusta el nombre o el saldo base de inicio.'}
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
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Nombre de la Billetera
              </label>
              <input
                type="text"
                required
                value={inputNombre}
                onChange={(e) => setInputNombre(e.target.value)}
                placeholder="Ej. BCP Sueldo, Ahorros, Negocio..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>

            {modalMode === 'create' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Moneda
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInputMoneda('PEN')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      inputMoneda === 'PEN'
                        ? 'bg-teal-50 border-teal-500 text-teal-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>Soles (S/ · PEN)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMoneda('USD')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      inputMoneda === 'USD'
                        ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>Dólares ($ · USD)</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Saldo Base Inicial
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setModoSaldo('hoy');
                      setInputFechaRef(fechaHoyISO());
                    }}
                    className={`font-semibold cursor-pointer ${
                      modoSaldo === 'hoy' ? 'text-teal-600 underline' : 'text-slate-400'
                    }`}
                  >
                    Desde Hoy
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setModoSaldo('pasado')}
                    className={`font-semibold cursor-pointer ${
                      modoSaldo === 'pasado' ? 'text-teal-600 underline' : 'text-slate-400'
                    }`}
                  >
                    Fecha pasada
                  </button>
                </div>
              </div>

              <input
                type="number"
                step="any"
                required
                value={inputMontoBase}
                onChange={(e) => setInputMontoBase(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Tu saldo de arranque a partir del cual se calculan los movimientos.
              </p>
            </div>

            {modoSaldo === 'pasado' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Fecha de Saldo Inicial
                </label>
                <input
                  type="date"
                  max={fechaHoyISO()}
                  value={inputFechaRef}
                  onChange={(e) => setInputFechaRef(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                />
              </div>
            )}

            {errorModal && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {errorModal}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                {guardando ? 'Guardando…' : modalMode === 'create' ? 'Crear Billetera' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </AnimatedModal>

      {/* 6. Modal Informativo Post-Creación de Billetera */}
      <AnimatedModal open={showPostCreatePrompt} label="Configuración de ingresos de la billetera">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden text-center p-6 sm:p-7 relative">
          <button
            type="button"
            onClick={() => {
              setShowPostCreatePrompt(false);
              setCreatedWalletName(null);
            }}
            aria-label="Cerrar aviso"
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-8 ring-teal-50/50 shadow-xs">
            <Sparkles className="h-7 w-7 text-teal-600" />
          </div>

          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            ¡Billetera creada con éxito!
          </h3>

          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            Has creado <strong className="text-slate-900 font-bold">{createdWalletName}</strong>. ¿Deseas registrar los ingresos programados o sueldo fijo de esta billetera ahora?
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-600 text-left flex items-start gap-2.5">
            <span className="text-base leading-none select-none">💡</span>
            <span className="leading-relaxed">
              Configurar tus ingresos te permitirá proyectar con exactitud tu flujo de liquidez quincena a quincena o mes a mes en el panel de control.
            </span>
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowPostCreatePrompt(false);
                setCreatedWalletName(null);
              }}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Hacerlo más tarde
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPostCreatePrompt(false);
                setCreatedWalletName(null);
                onNavigate?.('ingresos');
              }}
              className="min-h-11 flex-1 rounded-xl bg-teal-600 px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <span>Configurar ingresos</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </AnimatedModal>
    </div>
  );
};
