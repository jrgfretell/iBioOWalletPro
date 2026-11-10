import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { AnimatedModal } from './AnimatedModal';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import { confirmarAccion, toastExito } from '../lib/alerts';
import type { DeudaCuota } from '../types/wallet';

export function AbonosCuotaModal({ cuota, nombre, onClose }: { cuota: DeudaCuota; nombre: string; onClose: () => void }) {
  const { pagosDeuda, ejecutarOperacion, formatearMoneda, soloLectura, reportarError } = useWallet();
  const [ocupado, setOcupado] = useState(false);
  useWalletFormGuard(true, 'Abonos de cuota');
  const abonos = pagosDeuda.filter(p => p.cuota_id === cuota.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  const abonado = abonos.reduce((total, p) => total + p.monto, 0);
  return <AnimatedModal open label={`Abonos de la cuota ${cuota.numero}`}>
    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="border-b border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Abonos · Cuota {cuota.numero}</h2>
        <p className="mt-1 break-words text-sm text-slate-500">{nombre}</p>
      </header>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <div>Abonado<strong className="mt-1 block text-sm text-emerald-700">{formatearMoneda(abonado)}</strong></div>
          <div>Pendiente<strong className="mt-1 block text-sm text-slate-900">{formatearMoneda(Math.max(0, cuota.monto - abonado))}</strong></div>
        </div>
        <div className="max-h-[40dvh] space-y-2 overflow-y-auto">
          {abonos.length ? abonos.map(p => <article key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
            <div><strong className="block text-sm text-slate-900">{formatearMoneda(p.monto)}</strong><span className="text-xs text-slate-500">{p.fecha.split('-').reverse().join('/')}</span></div>
            <button type="button" disabled={ocupado || soloLectura} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              onClick={async () => {
                setOcupado(true);
                try {
                  if (!await confirmarAccion({ title: '¿Anular este abono?', text: `${nombre} · Cuota ${cuota.numero} · ${formatearMoneda(p.monto)}. Se retirará su gasto vinculado y se actualizará el saldo pendiente.`, confirmButtonText: 'Anular abono', compact: true })) return;
                  const resultado = await ejecutarOperacion('anular_abono', { pago_id: p.id }, crypto.randomUUID());
                  if (!resultado || typeof resultado !== 'object' || !('pago_id' in resultado) || Number(resultado.pago_id) !== p.id) throw new Error('No se pudo verificar la anulación. Actualiza la vista.');
                  toastExito('Abono anulado');
                } catch (error) { reportarError(error); } finally { setOcupado(false); }
              }}><RotateCcw className="h-3.5 w-3.5" />Anular abono</button>
          </article>) : <p className="py-3 text-center text-sm text-slate-500">Esta cuota no tiene abonos registrados.</p>}
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4"><button type="button" disabled={ocupado} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cerrar</button></div>
      </div>
    </div>
  </AnimatedModal>;
}
