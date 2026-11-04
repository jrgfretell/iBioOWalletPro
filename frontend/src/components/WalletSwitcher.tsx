import { useState } from 'react';
import type { FormEvent } from 'react';
import { Wallet, ChevronDown, Plus, Pencil, Archive, RotateCcw, Check, X, ArrowLeft, Eye } from 'lucide-react';
import { AnimatedModal } from './AnimatedModal';
import { useWallet } from '../context/WalletContext';
import { MONEDAS } from '../types/wallet';
import type { Billetera, Moneda } from '../types/wallet';
import { confirmarAccion } from '../lib/alerts';

export function WalletSwitcher() {
  const { billeteras, billeteraActual, modoLegacy, loading, escribiendo, seleccionarBilletera,
    crearBilletera, editarBilletera, archivarBilletera } = useWallet();
  const [open,setOpen]=useState(false);
  const [view,setView]=useState<'list'|'create'|'edit'>('list');
  const [editing,setEditing]=useState<Billetera|null>(null);
  const [nombre,setNombre]=useState('');
  const [moneda,setMoneda]=useState<Moneda>('PEN');
  const [busy,setBusy]=useState(false);
  const [archived,setArchived]=useState(false);
  const [failure,setFailure]=useState(false);
  const wallets=billeteras.filter(w=>w.archivada===archived);
  const close=()=>{if(!busy){setOpen(false);setView('list');setFailure(false);}};
  const startCreate=()=>{setEditing(null);setNombre('');setMoneda('PEN');setFailure(false);setView('create');};
  const startEdit=(wallet:Billetera)=>{setEditing(wallet);setNombre(wallet.nombre);setMoneda(wallet.moneda);setFailure(false);setView('edit');};
  const choose=async(wallet:Billetera)=>{
    setBusy(true);
    try {if(await seleccionarBilletera(wallet.id)) {setOpen(false);setView('list');}}
    finally{setBusy(false);}
  };
  const save=async(event:FormEvent)=>{
    event.preventDefault(); if(!nombre.trim()||busy) return;
    setBusy(true);setFailure(false);
    try {
      const ok=view==='create'?await crearBilletera(nombre,moneda):await editarBilletera(editing!.id,nombre);
      if(ok){setView('list');if(view==='create'){setOpen(false);setArchived(false);}}
      else setFailure(true);
    }finally{setBusy(false);}
  };
  const toggleArchive=async(wallet:Billetera)=>{
    if(!wallet.archivada&&!await confirmarAccion({title:`¿Archivar ${wallet.nombre}?`,text:'Conservarás su historial. Podrás consultarlo y reactivar la billetera cuando lo necesites.',confirmButtonText:'Archivar billetera',isDanger:false,icon:'question'})) return;
    setBusy(true);setFailure(false);
    try {if(!await archivarBilletera(wallet.id,!wallet.archivada))setFailure(true);}
    finally{setBusy(false);}
  };
  return <>
    <div className="mb-6 flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4">
      <button type="button" onClick={()=>{setOpen(true);setView('list');setFailure(false);}}
        aria-label={`Cambiar o administrar billetera: ${billeteraActual?.nombre||'Sin billetera activa'}`}
        disabled={loading||escribiendo} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Wallet className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Billetera actual</span>
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-bold text-slate-900">{loading&&!billeteraActual?'Cargando…':billeteraActual?.nombre||'Elige una billetera'}</span>
            {billeteraActual&&<span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{billeteraActual.moneda}</span>}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      <span className="hidden text-xs text-slate-500 sm:block">{billeteraActual?.archivada?'Consulta de historial':billeteraActual?MONEDAS[billeteraActual.moneda].nombre:'Tus finanzas, por separado'}</span>
    </div>
    {billeteraActual?.archivada&&<div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
      <span>Esta billetera está archivada. Puedes consultar su historial.</span>
      <button type="button" disabled={busy||escribiendo} onClick={()=>toggleArchive(billeteraActual)} className="min-h-11 font-semibold underline cursor-pointer">Reactivar billetera</button>
    </div>}
    <AnimatedModal open={open} label={view==='list'?'Mis billeteras':view==='create'?'Nueva billetera':'Editar billetera'}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {view!=='list'&&<button type="button" aria-label="Volver a mis billeteras" disabled={busy} onClick={()=>{setView('list');setFailure(false);}} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>}
            <div><h2 className="font-bold text-slate-900">{view==='list'?'Mis billeteras':view==='create'?'Nueva billetera':'Editar billetera'}</h2>
              <p className="text-xs text-slate-500">{view==='list'?'Cada billetera tiene sus propios ingresos y pagos.':'Organiza tus finanzas en su moneda original.'}</p></div>
          </div>
          <button type="button" disabled={busy} aria-label="Cerrar billeteras" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        {failure&&<p role="alert" className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">No se confirmó el cambio. Revisa los datos e inténtalo de nuevo.</p>}
        {modoLegacy?<div className="p-5 text-sm text-slate-600">La administración de billeteras aún no está disponible. Puedes seguir usando Personal con tus registros actuales.</div>:
          view==='list'?<div className="overflow-y-auto p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button type="button" aria-pressed={!archived} onClick={()=>setArchived(false)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${!archived?'bg-white text-slate-900 shadow-xs':'text-slate-500'}`}>Activas</button>
                <button type="button" aria-pressed={archived} onClick={()=>setArchived(true)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${archived?'bg-white text-slate-900 shadow-xs':'text-slate-500'}`}>Archivadas</button>
              </div>
              <button type="button" onClick={startCreate} disabled={busy||escribiendo} className="flex min-h-11 items-center gap-1 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><Plus className="h-4 w-4" />Nueva</button>
            </div>
            <div className="space-y-2">
              {!wallets.length&&<p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{archived?'No tienes billeteras archivadas.':'No tienes billeteras activas. Crea una o reactiva una archivada.'}</p>}
              {wallets.map(wallet=><div key={wallet.id} className={`rounded-xl border p-3 ${wallet.id===billeteraActual?.id?'border-teal-300 bg-teal-50/40':'border-slate-200'}`}>
                <button type="button" disabled={busy||escribiendo} onClick={()=>choose(wallet)} aria-label={`${wallet.archivada?'Consultar':'Seleccionar'} ${wallet.nombre}, ${MONEDAS[wallet.moneda].nombre}`}
                  className="flex min-h-11 w-full min-w-0 items-center gap-3 text-left disabled:opacity-50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">{MONEDAS[wallet.moneda].simbolo}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{wallet.nombre}</span><span className="text-xs text-slate-500">{MONEDAS[wallet.moneda].nombre} · {wallet.moneda}</span></span>
                  {wallet.id===billeteraActual?.id?<Check className="h-4 w-4 shrink-0 text-teal-600" />:wallet.archivada?<Eye className="h-4 w-4 text-slate-400" />:null}
                </button>
                <div className="mt-2 flex justify-end gap-1 border-t border-slate-100 pt-1">
                  <button type="button" disabled={busy||escribiendo} aria-label={`Editar ${wallet.nombre}`} onClick={()=>startEdit(wallet)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" />Editar</button>
                  <button type="button" disabled={busy||escribiendo} aria-label={`${wallet.archivada?'Reactivar':'Archivar'} ${wallet.nombre}`} onClick={()=>toggleArchive(wallet)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100">{wallet.archivada?<RotateCcw className="h-3.5 w-3.5" />:<Archive className="h-3.5 w-3.5" />}{wallet.archivada?'Reactivar':'Archivar'}</button>
                </div>
              </div>)}
            </div>
          </div>:<form onSubmit={save} className="space-y-5 p-5">
            <div><label htmlFor="wallet-name" className="mb-1.5 block text-xs font-semibold text-slate-700">Nombre de la billetera</label>
              <input id="wallet-name" required maxLength={80} value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej. Personal, Ahorros o Familia" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></div>
            <div><label htmlFor="wallet-currency" className="mb-1.5 block text-xs font-semibold text-slate-700">Moneda</label>
              <select id="wallet-currency" value={moneda} disabled={view==='edit'} onChange={e=>setMoneda(e.target.value as Moneda)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base disabled:bg-slate-50 disabled:text-slate-500">
                {Object.entries(MONEDAS).map(([code,currency])=><option key={code} value={code}>{currency.nombre} ({code})</option>)}
              </select><p className="mt-2 text-xs leading-relaxed text-slate-500">{view==='create'?'Comenzará con saldo cero y categorías sugeridas. Los importes se mantienen en esta moneda, sin conversiones.':'Para usar otra moneda, crea una nueva billetera.'}</p></div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" disabled={busy} onClick={()=>{setView('list');setFailure(false);}} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm text-slate-600">Cancelar</button>
              <button type="submit" disabled={busy||!nombre.trim()} className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?'Guardando…':view==='create'?'Crear billetera':'Guardar nombre'}</button>
            </div>
          </form>}
      </div>
    </AnimatedModal>
  </>;
}
