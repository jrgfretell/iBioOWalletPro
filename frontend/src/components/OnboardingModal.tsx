import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Wallet, CalendarCheck, TrendingUp, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, X, History } from 'lucide-react';
import { AnimatedModal } from './AnimatedModal';
import { useWallet } from '../context/WalletContext';
import { fechaHoyISO } from '../types/wallet';
import type { Moneda } from '../types/wallet';
import { toastExito } from '../lib/alerts';

const SUGERENCIAS_NOMBRE = ['Personal', 'Principal', 'Ahorros', 'Mi Negocio', 'Casa'];

interface OnboardingModalProps {
  autoOpenFirstWallet?: boolean;
  forceOpenGuide?: boolean;
  onCloseGuide?: () => void;
  onCreated?: (nombre: string) => void;
}

export function OnboardingModal({ autoOpenFirstWallet = true, forceOpenGuide = false, onCloseGuide, onCreated }: OnboardingModalProps) {
  const { billeteras, modoLegacy, loading, escribiendo, error, limpiarError, crearBilletera, monedasDisponibles, monedasCargadas } = useWallet();

  // Es obligatorio cuando el usuario ya cargó y no tiene ninguna billetera creada
  const requiresFirstWallet = autoOpenFirstWallet && !loading && !modoLegacy && billeteras.length === 0;
  const isOpen = requiresFirstWallet || forceOpenGuide;

  const [step, setStep] = useState<'welcome' | 'create'>('welcome');
  const [submitted, setSubmitted] = useState(false);
  const [nombre, setNombre] = useState('Personal');
  const [moneda, setMoneda] = useState<Moneda>('');
  const [modoSaldo, setModoSaldo] = useState<'hoy' | 'pasado'>('hoy');
  const [montoBase, setMontoBase] = useState('0');
  const [fechaRef, setFechaRef] = useState(() => fechaHoyISO());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    if (monedasCargadas && !monedasDisponibles.some(m => m.codigo === moneda)) {
      setMoneda(monedasDisponibles[0]?.codigo || '');
    }
  }, [monedasCargadas, monedasDisponibles, moneda]);

  if (!isOpen || submitted) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !moneda || busy || escribiendo) return;
    setBusy(true);
    setFailure(false);
    limpiarError();
    try {
      const parsedMonto = parseFloat(montoBase);
      const montoFinal = Number.isFinite(parsedMonto) ? parsedMonto : 0;
      const fechaFinal = modoSaldo === 'hoy' ? fechaHoyISO() : (fechaRef || fechaHoyISO());
      const nombreFinal = nombre.trim();
      const ok = await crearBilletera(nombreFinal, moneda, montoFinal, fechaFinal);
      if (ok) {
        setSubmitted(true);
        toastExito(`¡Billetera "${nombreFinal}" creada con éxito!`);
        onCloseGuide?.();
        onCreated?.(nombreFinal);
      } else {
        setFailure(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const canClose = !requiresFirstWallet && !busy;

  return (
    <AnimatedModal
      open={isOpen}
      label={step === 'welcome' ? 'Bienvenido a Mi Billete Pro' : 'Configura tu primera billetera'}
    >
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Cabecera con gradiente */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/20 border border-teal-400/30 text-teal-300 shadow-inner">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-teal-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
                  {requiresFirstWallet ? (step === 'welcome' ? 'Paso 1 de 2 · Guía Rápida' : 'Paso 2 de 2 · Configuración Inicial') : 'Guía de Funcionamiento'}
                </span>
                <h2 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-white">
                  {step === 'welcome' ? '¡Bienvenido a Mi Billete Pro!' : 'Crea tu primera billetera'}
                </h2>
              </div>
            </div>
            {canClose && (
              <button
                type="button"
                onClick={onCloseGuide}
                aria-label="Cerrar guía"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
            {step === 'welcome'
              ? 'Antes de empezar, conoce en 20 segundos cómo se organiza tu dinero para aprovechar al máximo tus proyecciones.'
              : 'Personaliza el nombre, la moneda y el saldo inicial con el que partirán tus proyecciones financieras.'}
          </p>
        </div>

        {/* Contenido Paso 1: Orientación */}
        {step === 'welcome' ? (
          <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
            <div className="space-y-3.5">
              <div className="flex items-start gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">1. Billeteras como Perfiles Independientes</h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Cada billetera tiene una moneda del catálogo activo, su <strong>Saldo Inicial de Referencia</strong> y sus propios registros. Puedes crear perfiles separados para tus cuentas personales, ahorros o negocio.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">2. Pagos Programados, Cronogramas y Sueldos</h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Registra tus compromisos en cuotas (préstamos, tarjetas), pagos fijos mensuales (<em>hasta cancelar</em>) y configura tu sueldo quincenal o de fin de mes en <strong>Pagos programados</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">3. Proyección Mensual Inteligente</h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Tomando el <strong>Saldo Inicial</strong> de tu billetera junto con tus ingresos y pagos pendientes, el Dashboard proyecta tu liquidez mes a mes (antes del 15, tras quincena y a fin de mes) para evitar saldos negativos.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              {requiresFirstWallet ? (
                <button
                  type="button"
                  onClick={() => {
                    limpiarError();
                    setFailure(false);
                    setStep('create');
                  }}
                  className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 transition-all cursor-pointer"
                >
                  <span>Configurar mi primera billetera</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCloseGuide}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Entendido</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Contenido Paso 2: Crear primera billetera */
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
            {(failure || error) && (
              <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-700">
                {error || 'No se pudo crear la billetera. Revisa los datos e inténtalo nuevamente.'}
              </div>
            )}

            <div>
              <label htmlFor="onb-wallet-name" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Nombre de tu billetera
              </label>
              <input
                id="onb-wallet-name"
                type="text"
                required
                maxLength={80}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Personal, Ahorros, Mi Negocio..."
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Sugerencias:</span>
                {SUGERENCIAS_NOMBRE.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setNombre(sug)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      nombre === sug
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Moneda de la billetera
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {monedasDisponibles.map((info) => (
                  <button
                    key={info.codigo}
                    type="button"
                    onClick={() => setMoneda(info.codigo)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all cursor-pointer ${
                      moneda === info.codigo
                        ? 'border-teal-600 bg-teal-50/70 text-teal-900 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-lg font-black">{info.simbolo}</span>
                    <span className="text-xs font-bold mt-0.5">{info.nombre}</span>
                    <span className="text-[10px] text-slate-400">{info.codigo}</span>
                  </button>
                ))}
              </div>
              {monedasCargadas && monedasDisponibles.length === 0 && (
                <p className="mt-2 text-sm text-rose-700">No se pudieron cargar monedas activas desde el catálogo. Actualiza la página o inténtalo más tarde.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Saldo Inicial de Referencia
                </span>
                <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
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
                      setFechaRef(fechaHoyISO());
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
                  <label htmlFor="onb-wallet-balance" className="block text-xs font-semibold text-slate-600 mb-1">
                    Saldo disponible ({monedasDisponibles.find(m => m.codigo === moneda)?.simbolo || moneda})
                  </label>
                  <input
                    id="onb-wallet-balance"
                    type="number"
                    step="0.01"
                    required
                    value={montoBase}
                    onChange={(e) => setMontoBase(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <div className="mt-2.5 rounded-xl bg-teal-50 border border-teal-200/80 p-2.5 text-xs text-teal-900 leading-relaxed">
                    ✓ <strong>Punto de partida: Hoy ({fechaHoyISO()})</strong>. Si registras compromisos o cuotas que pagaste meses atrás, <strong>NO</strong> se descontarán de este dinero. Solo se descontarán pagos desde hoy en adelante.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="onb-wallet-balance" className="block text-xs font-semibold text-slate-600 mb-1">
                        Capital inicial ({monedasDisponibles.find(m => m.codigo === moneda)?.simbolo || moneda})
                      </label>
                      <input
                        id="onb-wallet-balance"
                        type="number"
                        step="0.01"
                        required
                        value={montoBase}
                        onChange={(e) => setMontoBase(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="onb-wallet-date" className="block text-xs font-semibold text-slate-600 mb-1">
                        ¿En qué fecha tenías este capital?
                      </label>
                      <input
                        id="onb-wallet-date"
                        type="date"
                        required
                        max={fechaHoyISO()}
                        value={fechaRef}
                        onChange={(e) => setFechaRef(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-2.5 text-xs text-amber-900 leading-relaxed">
                    ℹ️ <strong>Reconstrucción histórica</strong>: Los abonos de cuotas y gastos posteriores a <strong>{fechaRef || 'la fecha elegida'}</strong> se irán restando mes a mes hasta calcular cuánto dinero te queda actualmente.
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('welcome')}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Volver a la guía</span>
              </button>

              <button
                type="submit"
                disabled={busy || !nombre.trim() || (step === 'create' && (!monedasCargadas || !monedasDisponibles.some(m => m.codigo === moneda && m.activo !== false)))}
                className="inline-flex min-h-11 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{busy ? 'Creando billetera…' : 'Crear mi billetera y entrar'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AnimatedModal>
  );
}
