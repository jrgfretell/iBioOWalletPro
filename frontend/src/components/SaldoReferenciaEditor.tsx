import { useState } from 'react';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import { fechaHoyISO } from '../types/wallet';

export function SaldoReferenciaEditor({onClose}:{onClose:()=>void}) {
  const {montoBase,fechaReferencia,soporteEtapa5,actualizarMontoBase,simboloMoneda,soloLectura,error}=useWallet();
  const [monto,setMonto]=useState(String(montoBase));
  const [fecha,setFecha]=useState(fechaReferencia||fechaHoyISO());
  const [solicitud,setSolicitud]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false);
  useWalletFormGuard(true,'Saldo de referencia');
  return <form className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-slate-800" onSubmit={async e=>{
    e.preventDefault(); if(busy)return; setBusy(true);
    try {if(await actualizarMontoBase(Number(monto),fecha,solicitud))onClose();}finally{setBusy(false);}
  }}>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    <label className="block text-xs font-semibold">Saldo disponible ({simboloMoneda})
      <input required disabled={busy||soloLectura} type="number" step="0.01" value={monto} onChange={e=>{setMonto(e.target.value);setSolicitud(crypto.randomUUID());}} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-base" />
    </label>
    {soporteEtapa5&&<><label className="block text-xs font-semibold">Al cierre del día
      <input required disabled={busy||soloLectura} type="date" max={fechaHoyISO()} value={fecha} onChange={e=>{setFecha(e.target.value);setSolicitud(crypto.randomUUID());}} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-base" />
    </label><p className="text-xs leading-relaxed text-slate-500">Este saldo ya incluye los ingresos y gastos realizados hasta esa fecha. La proyección aplicará los posteriores y todos los pagos aún pendientes. El historial se conserva.</p></>}
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-3 text-xs font-semibold">Cancelar</button>
      <button disabled={busy||soloLectura} className="min-h-11 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy?'Guardando…':'Guardar referencia'}</button>
    </div>
  </form>;
}
