import { useState } from 'react';
import { Wallet, History } from 'lucide-react';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import { fechaHoyISO } from '../types/wallet';

export function SaldoReferenciaEditor({ onClose }: { onClose: () => void }) {
  const { montoBase, fechaReferencia, soporteEtapa5, actualizarMontoBase, simboloMoneda, soloLectura, error } = useWallet();
  const hoy = fechaHoyISO();
  const [modoSaldo, setModoSaldo] = useState<'hoy' | 'pasado'>(() => {
    return (fechaReferencia && fechaReferencia < hoy) ? 'pasado' : 'hoy';
  });
  const [monto, setMonto] = useState(String(montoBase));
  const [fecha, setFecha] = useState(fechaReferencia || hoy);
  const [solicitud, setSolicitud] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  useWalletFormGuard(true, 'Saldo de referencia');

  const fechaFinal = modoSaldo === 'hoy' ? hoy : (fecha || hoy);

  return (
    <form
      className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-slate-800 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          if (await actualizarMontoBase(Number(monto), fechaFinal, solicitud)) {
            onClose();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <h3 className="text-sm font-bold text-slate-900">Editar Saldo Inicial de Referencia</h3>
        <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
          Base de Proyección
        </span>
      </div>

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      {soporteEtapa5 && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            ¿Cómo deseas definir tu saldo inicial?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || soloLectura}
              onClick={() => {
                setModoSaldo('hoy');
                setFecha(hoy);
                setSolicitud(crypto.randomUUID());
              }}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                modoSaldo === 'hoy'
                  ? 'border-teal-500 bg-teal-50/80 text-teal-950 ring-2 ring-teal-500/20 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                  Lo que tienes en mano ahora mismo.
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={busy || soloLectura}
              onClick={() => {
                setModoSaldo('pasado');
                setSolicitud(crypto.randomUUID());
              }}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                modoSaldo === 'pasado'
                  ? 'border-teal-500 bg-teal-50/80 text-teal-950 ring-2 ring-teal-500/20 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                  Reconstruir saldo descontando cuotas pasadas.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {modoSaldo === 'hoy' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Saldo disponible ({simboloMoneda})
            <input
              required
              disabled={busy || soloLectura}
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => {
                setMonto(e.target.value);
                setSolicitud(crypto.randomUUID());
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="mt-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 p-2.5 text-xs text-teal-900 leading-relaxed">
            ✓ <strong>Punto de partida: Hoy ({hoy})</strong>. Los pagos o gastos pasados registrados en tus cronogramas <strong>NO</strong> restarán este saldo. Solo se aplicarán los compromisos y movimientos a partir de hoy.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-700">
              Capital inicial ({simboloMoneda})
              <input
                required
                disabled={busy || soloLectura}
                type="number"
                step="0.01"
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setSolicitud(crypto.randomUUID());
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              ¿En qué fecha tenías este capital?
              <input
                required
                disabled={busy || soloLectura}
                type="date"
                max={hoy}
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setSolicitud(crypto.randomUUID());
                }}
                className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-2.5 text-xs text-amber-900 leading-relaxed">
            ℹ️ <strong>Reconstrucción histórica</strong>: Los abonos de cronogramas y gastos posteriores al <strong>{fecha || 'día indicado'}</strong> se irán restando mes a mes hasta proyectar tu saldo actual.
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          disabled={busy || soloLectura}
          className="min-h-11 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
        >
          {busy ? 'Guardando…' : 'Guardar referencia'}
        </button>
      </div>
    </form>
  );
}
