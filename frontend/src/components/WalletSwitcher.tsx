import { useState } from 'react';
import type { FormEvent } from 'react';
import { Wallet, ChevronDown, Plus, Pencil, Archive, RotateCcw, Check, X, ArrowLeft, Eye, Trash2, HelpCircle, History } from 'lucide-react';
import { AnimatedModal } from './AnimatedModal';
import { OnboardingModal } from './OnboardingModal';
import { useWallet } from '../context/WalletContext';
import { MONEDAS, fechaHoyISO, formatearMoneda as formatoMonetario } from '../types/wallet';
import type { Billetera, Moneda } from '../types/wallet';
import { confirmarAccion, alertaInfo, alertaError, toastExito } from '../lib/alerts';

export function WalletSwitcher() {
  const {
    billeteras,
    billeteraActual,
    montoBase: montoBaseActual,
    fechaReferencia: fechaRefActual,
    modoLegacy,
    loading,
    escribiendo,
    error,
    limpiarError,
    seleccionarBilletera,
    crearBilletera,
    editarBilletera,
    archivarBilletera,
    eliminarBilletera,
    formatearMoneda,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [editing, setEditing] = useState<Billetera | null>(null);
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('PEN');
  const [modoSaldo, setModoSaldo] = useState<'hoy' | 'pasado'>('hoy');
  const [inputMontoBase, setInputMontoBase] = useState('0');
  const [inputFechaRef, setInputFechaRef] = useState(() => fechaHoyISO());
  const [busy, setBusy] = useState(false);
  const [archived, setArchived] = useState(false);
  const [failure, setFailure] = useState(false);

  const wallets = billeteras.filter((w) => w.archivada === archived);

  const close = () => {
    if (!busy) {
      setOpen(false);
      setView('list');
      setFailure(false);
      limpiarError();
    }
  };

  const startCreate = () => {
    setEditing(null);
    setNombre('');
    setMoneda('PEN');
    setModoSaldo('hoy');
    setInputMontoBase('0');
    setInputFechaRef(fechaHoyISO());
    setFailure(false);
    limpiarError();
    setView('create');
  };

  const startEdit = (wallet: Billetera) => {
    const isCurrent = wallet.id === billeteraActual?.id;
    const baseVal = isCurrent ? montoBaseActual : (wallet.monto_base ?? 0);
    const fechaVal = (isCurrent ? fechaRefActual : wallet.fecha_referencia) || fechaHoyISO();
    const hoy = fechaHoyISO();
    setModoSaldo((fechaVal && fechaVal < hoy) ? 'pasado' : 'hoy');
    setEditing(wallet);
    setNombre(wallet.nombre);
    setMoneda(wallet.moneda);
    setInputMontoBase(String(baseVal));
    setInputFechaRef(fechaVal);
    setFailure(false);
    limpiarError();
    setView('edit');
  };

  const openDirectEditCurrent = () => {
    if (!billeteraActual || loading || escribiendo) return;
    startEdit(billeteraActual);
    setOpen(true);
  };

  const choose = async (wallet: Billetera) => {
    setBusy(true);
    try {
      if (await seleccionarBilletera(wallet.id)) {
        setOpen(false);
        setView('list');
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!nombre.trim() || busy) return;
    setBusy(true);
    setFailure(false);
    limpiarError();
    try {
      const parsedMonto = parseFloat(inputMontoBase);
      const montoFinal = Number.isFinite(parsedMonto) ? parsedMonto : 0;
      const hoy = fechaHoyISO();
      const fechaFinal = modoSaldo === 'hoy' ? hoy : (inputFechaRef || hoy);

      const ok =
        view === 'create'
          ? await crearBilletera(nombre, moneda, montoFinal, fechaFinal)
          : await editarBilletera(editing!.id, nombre, montoFinal, fechaFinal);

      if (ok) {
        await toastExito(view === 'create' ? 'Billetera creada' : 'Billetera actualizada');
        setView('list');
        if (view === 'create') {
          setOpen(false);
          setArchived(false);
        }
      } else {
        setFailure(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (wallet: Billetera) => {
    if (
      !wallet.archivada &&
      !(await confirmarAccion({
        title: `¿Archivar ${wallet.nombre}?`,
        text: 'Conservarás su historial. Podrás consultarlo y reactivar la billetera cuando lo necesites.',
        confirmButtonText: 'Archivar billetera',
        isDanger: false,
        icon: 'question',
      }))
    )
      return;
    setBusy(true);
    setFailure(false);
    try {
      if (!(await archivarBilletera(wallet.id, !wallet.archivada))) setFailure(true);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (wallet: Billetera) => {
    if (wallet.es_principal) {
      await alertaInfo('Billetera principal', 'La billetera principal no puede ser eliminada.');
      return;
    }
    const confirmado = await confirmarAccion({
      title: `¿Eliminar ${wallet.nombre}?`,
      text: 'Esta acción es permanente. Solo se completará si la billetera no tiene movimientos, compromisos ni saldos registrados.',
      confirmButtonText: 'Sí, eliminar',
      isDanger: true,
      icon: 'warning',
    });
    if (!confirmado) return;
    setBusy(true);
    setFailure(false);
    try {
      const ok = await eliminarBilletera(wallet.id);
      if (ok) {
        await toastExito(`Billetera "${wallet.nombre}" eliminada`);
      } else {
        setFailure(true);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo eliminar la billetera.';
      await alertaError('No se pudo eliminar', msg);
    } finally {
      setBusy(false);
    }
  };

  const fechaRefFormateada = fechaRefActual ? fechaRefActual.split('-').reverse().join('/') : null;

  return (
    <>
      <OnboardingModal forceOpenGuide={showGuide} onCloseGuide={() => setShowGuide(false)} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 shadow-2xs">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setView('list');
            setFailure(false);
            limpiarError();
          }}
          aria-label={`Cambiar o administrar billetera: ${billeteraActual?.nombre || 'Sin billetera activa'}`}
          disabled={loading || escribiendo}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Billetera actual
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-bold text-slate-900">
                {loading && !billeteraActual ? 'Cargando…' : billeteraActual?.nombre || 'Elige una billetera'}
              </span>
              {billeteraActual && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {billeteraActual.moneda}
                </span>
              )}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>

        {/* Información consolidada de Saldo Inicial Base en la barra de la billetera */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0 w-full sm:w-auto justify-between sm:justify-end">
          {billeteraActual && (
            <button
              type="button"
              disabled={loading || escribiendo || billeteraActual.archivada}
              onClick={openDirectEditCurrent}
              title="Editar nombre o saldo inicial de referencia de esta billetera"
              className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-teal-50/70 border border-slate-200/80 hover:border-teal-200 px-3 py-1.5 text-left transition-all cursor-pointer disabled:opacity-60"
            >
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Saldo Base {fechaRefFormateada ? `(${fechaRefFormateada})` : ''}
                </span>
                <span className="text-xs font-extrabold text-slate-800">
                  {formatearMoneda(montoBaseActual)}
                </span>
              </div>
              <Pencil className="h-3.5 w-3.5 text-teal-600 shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGuide(true)}
            title="¿Cómo funciona Mi Billetera Pro?"
            aria-label="Ver guía de funcionamiento"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-teal-600 transition-colors cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {billeteraActual?.archivada && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span>Esta billetera está archivada. Puedes consultar su historial.</span>
          <button
            type="button"
            disabled={busy || escribiendo}
            onClick={() => toggleArchive(billeteraActual)}
            className="min-h-11 font-semibold underline cursor-pointer"
          >
            Reactivar billetera
          </button>
        </div>
      )}

      <AnimatedModal open={open} label={view === 'list' ? 'Mis billeteras' : view === 'create' ? 'Nueva billetera' : 'Editar billetera'}>
        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              {view !== 'list' && (
                <button
                  type="button"
                  aria-label="Volver a mis billeteras"
                  disabled={busy}
                  onClick={() => {
                    setView('list');
                    setFailure(false);
                    limpiarError();
                  }}
                  className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h2 className="font-bold text-slate-900">
                  {view === 'list' ? 'Mis billeteras' : view === 'create' ? 'Nueva billetera' : 'Editar billetera'}
                </h2>
                <p className="text-xs text-slate-500">
                  {view === 'list'
                    ? 'Cada billetera tiene su propio saldo base, ingresos y pagos.'
                    : 'Configura el nombre, moneda y saldo inicial de referencia.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              aria-label="Cerrar billeteras"
              onClick={close}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {failure && (
            <p role="alert" className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {error || 'No se confirmó el cambio. Revisa los datos e inténtalo de nuevo.'}
            </p>
          )}

          {modoLegacy ? (
            <div className="p-5 text-sm text-slate-600">
              La administración de billeteras aún no está disponible. Puedes seguir usando Personal con tus registros actuales.
            </div>
          ) : view === 'list' ? (
            <div className="overflow-y-auto p-4 sm:p-5 max-h-[75vh]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    aria-pressed={!archived}
                    onClick={() => setArchived(false)}
                    className={`min-h-10 rounded-lg px-3 text-xs font-semibold cursor-pointer ${
                      !archived ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Activas
                  </button>
                  <button
                    type="button"
                    aria-pressed={archived}
                    onClick={() => setArchived(true)}
                    className={`min-h-10 rounded-lg px-3 text-xs font-semibold cursor-pointer ${
                      archived ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Archivadas
                  </button>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  disabled={busy || escribiendo}
                  className="flex min-h-11 items-center gap-1 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Nueva billetera
                </button>
              </div>

              <div className="space-y-2.5">
                {!wallets.length && (
                  <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    {archived
                      ? 'No tienes billeteras archivadas.'
                      : 'No tienes billeteras activas. Crea una o reactiva una archivada.'}
                  </p>
                )}
                {wallets.map((wallet) => {
                  const isCurrent = wallet.id === billeteraActual?.id;
                  const wBase = isCurrent ? montoBaseActual : (wallet.monto_base ?? 0);
                  const wFecha = isCurrent ? fechaRefActual : wallet.fecha_referencia;
                  return (
                    <div
                      key={wallet.id}
                      className={`rounded-xl border p-3 ${
                        isCurrent ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy || escribiendo}
                        onClick={() => choose(wallet)}
                        aria-label={`${wallet.archivada ? 'Consultar' : 'Seleccionar'} ${wallet.nombre}, ${MONEDAS[wallet.moneda].nombre}`}
                        className="flex min-h-11 w-full min-w-0 items-center gap-3 text-left disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                          {MONEDAS[wallet.moneda].simbolo}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-slate-900">{wallet.nombre}</span>
                            {wallet.es_principal && (
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-800">
                                Principal
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {MONEDAS[wallet.moneda].nombre} ({wallet.moneda}) · Base:{' '}
                            <strong className="text-slate-700">{formatoMonetario(wBase, wallet.moneda)}</strong>
                            {wFecha ? ` al ${wFecha.split('-').reverse().join('/')}` : ''}
                          </span>
                        </span>
                        {isCurrent ? (
                          <Check className="h-4 w-4 shrink-0 text-teal-600" />
                        ) : wallet.archivada ? (
                          <Eye className="h-4 w-4 text-slate-400" />
                        ) : null}
                      </button>
                      <div className="mt-2 flex flex-wrap justify-end gap-1 border-t border-slate-100 pt-1">
                        <button
                          type="button"
                          disabled={busy || escribiendo || wallet.archivada}
                          aria-label={`Editar ${wallet.nombre}`}
                          onClick={() => startEdit(wallet)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar / Saldo base
                        </button>
                        <button
                          type="button"
                          disabled={busy || escribiendo}
                          aria-label={`${wallet.archivada ? 'Reactivar' : 'Archivar'} ${wallet.nombre}`}
                          onClick={() => toggleArchive(wallet)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          {wallet.archivada ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          {wallet.archivada ? 'Reactivar' : 'Archivar'}
                        </button>
                        {!wallet.es_principal && (
                          <button
                            type="button"
                            disabled={busy || escribiendo}
                            aria-label={`Eliminar ${wallet.nombre}`}
                            onClick={() => handleDelete(wallet)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="flex flex-col max-h-[75vh] overflow-hidden">
              <div className="space-y-4 p-4 sm:p-5 overflow-y-auto flex-1">
                <div>
                  <label htmlFor="wallet-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Nombre de la billetera
                  </label>
                <input
                  id="wallet-name"
                  required
                  maxLength={80}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Personal, Ahorros o Familia"
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label htmlFor="wallet-currency" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Moneda
                </label>
                <select
                  id="wallet-currency"
                  value={moneda}
                  disabled={view === 'edit'}
                  onChange={(e) => setMoneda(e.target.value as Moneda)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {Object.entries(MONEDAS).map(([code, currency]) => (
                    <option key={code} value={code}>
                      {currency.nombre} ({code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Parámetros consolidados de Saldo Inicial de Referencia */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Saldo Inicial de Referencia</span>
                  <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                    Base de Proyección
                  </span>
                </div>

                {/* Selector de modalidad */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    ¿Cómo deseas definir tu saldo inicial?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModoSaldo('hoy');
                        setInputFechaRef(fechaHoyISO());
                      }}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        modoSaldo === 'hoy'
                          ? 'border-teal-500 bg-white text-teal-950 ring-2 ring-teal-500/20 shadow-sm'
                          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          modoSaldo === 'hoy' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">Dinero disponible HOY</span>
                          <span className="rounded bg-teal-100 px-1.5 py-0.2 text-[9px] font-bold text-teal-800">Recomendado</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 leading-tight">
                          Lo que tienes en mano o cuenta ahora mismo.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModoSaldo('pasado')}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        modoSaldo === 'pasado'
                          ? 'border-teal-500 bg-white text-teal-950 ring-2 ring-teal-500/20 shadow-sm'
                          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          modoSaldo === 'pasado' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <History className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900">Capital inicial en el PASADO</span>
                        <p className="mt-0.5 text-[11px] text-slate-500 leading-tight">
                          Reconstruye tu saldo descontando pagos históricos.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {modoSaldo === 'hoy' ? (
                  <div>
                    <label htmlFor="wallet-base-amount" className="mb-1 block text-xs font-semibold text-slate-600">
                      Saldo disponible ({MONEDAS[moneda].simbolo})
                    </label>
                    <input
                      id="wallet-base-amount"
                      type="number"
                      step="0.01"
                      required
                      value={inputMontoBase}
                      onChange={(e) => setInputMontoBase(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                    <div className="mt-2.5 rounded-xl bg-teal-50 border border-teal-200/80 p-2.5 text-xs text-teal-900 leading-relaxed">
                      ✓ <strong>Punto de partida: Hoy ({fechaHoyISO()})</strong>. Si registras compromisos o cuotas que pagaste en meses anteriores, <strong>NO</strong> se descontarán de este dinero. Solo se descontarán pagos desde hoy en adelante.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="wallet-base-amount" className="mb-1 block text-xs font-semibold text-slate-600">
                          Capital inicial ({MONEDAS[moneda].simbolo})
                        </label>
                        <input
                          id="wallet-base-amount"
                          type="number"
                          step="0.01"
                          required
                          value={inputMontoBase}
                          onChange={(e) => setInputMontoBase(e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                        />
                      </div>

                      <div>
                        <label htmlFor="wallet-base-date" className="mb-1 block text-xs font-semibold text-slate-600">
                          ¿En qué fecha tenías este capital?
                        </label>
                        <input
                          id="wallet-base-date"
                          type="date"
                          required
                          max={fechaHoyISO()}
                          value={inputFechaRef}
                          onChange={(e) => setInputFechaRef(e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                        />
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-2.5 text-xs text-amber-900 leading-relaxed">
                      ℹ️ <strong>Reconstrucción histórica</strong>: Los abonos de cuotas y gastos posteriores a <strong>{inputFechaRef || 'la fecha elegida'}</strong> se irán restando mes a mes hasta calcular cuánto te queda actualmente.
                    </div>
                  </div>
                )}
              </div>

              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 p-4 bg-white shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setView('list');
                    setFailure(false);
                    limpiarError();
                  }}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || !nombre.trim()}
                  className="min-h-11 rounded-xl bg-teal-600 px-5 text-sm font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Guardando…' : view === 'create' ? 'Crear billetera' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          )}
        </div>
      </AnimatedModal>
    </>
  );
}
