import { useState } from 'react';
import { AnimatedModal } from './AnimatedModal';
import { useWallet, useWalletFormGuard } from '../context/WalletContext';
import { fechaHoyISO } from '../types/wallet';
import { confirmarAccion } from '../lib/alerts';

export interface CuotaDestinoPago { cuotaId:number; numero:number; pendiente:number; }

export interface ObjetivoPago {
  nombre:string; monto:number; vencimiento:string; cuotaId?:number; recurrenteId?:number;
  cuotasSiguientes?:CuotaDestinoPago[];
  solicitud:string;
}
export function RegistrarPagoModal({objetivo,onClose}:{objetivo:ObjetivoPago;onClose:()=>void}) {
  const {ejecutarOperacion,fechaReferencia,formatearMoneda,simboloMoneda,soloLectura,reportarError,limpiarError}=useWallet();
  const [importe,setImporte]=useState(String(objetivo.monto));
  const [fecha,setFecha]=useState(fechaHoyISO());
  const [solicitud,setSolicitud]=useState(objetivo.solicitud);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const importeCentavos=Math.round((Number(importe)||0)*100);
  const destinos=objetivo.cuotasSiguientes?.length ? objetivo.cuotasSiguientes : (objetivo.cuotaId ? [{cuotaId:objetivo.cuotaId,numero:1,pendiente:objetivo.monto}] : []);
  const maximoCentavos=destinos.reduce((total,cuota)=>total+Math.round(cuota.pendiente*100),0);
  let porAsignar=importeCentavos;
  const distribucion=destinos.flatMap(cuota=>{
    const asignado=Math.min(porAsignar,Math.round(cuota.pendiente*100));
    porAsignar-=asignado;
    return asignado>0?[{cuotaId:cuota.cuotaId,numero:cuota.numero,centavos:asignado}]:[];
  });
  const excedeCuotaActual=Boolean(objetivo.cuotaId&&importeCentavos>Math.round(objetivo.monto*100));
  const montoValido=importeCentavos>0&&importeCentavos<=maximoCentavos&&porAsignar===0;
  useWalletFormGuard(true,'Registrar pago');
  return <AnimatedModal open label="Registrar pago">
    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-slate-900">Registrar pago</h2><p className="mt-1 text-sm text-slate-500">{objetivo.nombre}</p></div>
      <form className="space-y-4 p-5" onSubmit={async e=>{
        e.preventDefault(); if(busy)return;
        if(excedeCuotaActual){
          const detalle=distribucion.map(item=>`Cuota ${item.numero}: ${formatearMoneda(item.centavos/100)}`).join('\n');
          const continuar=await confirmarAccion({title:'Distribuir abono en el cronograma',text:`El importe cubrirá la cuota seleccionada y continuará en las siguientes, sin cambiar sus fechas.\n\n${detalle}`,confirmButtonText:'Confirmar distribución',cancelButtonText:'Revisar',isDanger:false,icon:'info'});
          if(!continuar)return;
        }
        setBusy(true);setFailed(false);limpiarError();
        try {
          await ejecutarOperacion(objetivo.cuotaId?'pagar_cuota':'confirmar_recurrente',objetivo.cuotaId?
            {cuota_id:objetivo.cuotaId,monto:Number(importe),fecha,distribucion:distribucion.map(item=>({cuota_id:item.cuotaId,monto:item.centavos/100}))}:
            {recurrente_id:objetivo.recurrenteId,vencimiento:objetivo.vencimiento,fecha_pago:fecha},solicitud);
          onClose();
        } catch(error){reportarError(error);setFailed(true);}finally{setBusy(false);}
      }}>
        <p className="text-xs text-slate-500">Pendiente: <strong>{formatearMoneda(objetivo.monto)}</strong> · Vencimiento: {objetivo.vencimiento.split('-').reverse().join('/')}</p>
        {failed&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">No se confirmó el pago. Revisa los datos y reintenta; conservar los mismos datos evita duplicar un abono ya recibido por el servidor.</p>}
        <label className="block text-xs font-semibold text-slate-700">Importe del pago ({simboloMoneda})
          <input required type="number" min="0.01" step="0.01" max={objetivo.cuotaId?maximoCentavos/100:objetivo.monto} disabled={!objetivo.cuotaId||busy} value={importe} onChange={e=>{setImporte(e.target.value);setSolicitud(crypto.randomUUID());}} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base disabled:bg-slate-50" />
        </label>
        {objetivo.cuotaId&&<div className="space-y-2 text-xs text-slate-500"><p>Puedes abonar esta cuota o adelantar saldo de las siguientes.</p><p>Máximo aplicable desde esta cuota: <strong>{formatearMoneda(maximoCentavos/100)}</strong>.</p>{excedeCuotaActual&&<div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-teal-900"><strong>Distribución automática</strong><ul className="mt-1 space-y-1">{distribucion.map(item=><li key={item.cuotaId}>Cuota {item.numero}: {formatearMoneda(item.centavos/100)}</li>)}</ul><p className="mt-1">Las fechas se mantienen y no se supera el total del cronograma.</p></div>}{importeCentavos>maximoCentavos&&<p role="alert" className="text-red-600">El importe supera el saldo pendiente de esta cuota y las siguientes.</p>}</div>}
        <label className="block text-xs font-semibold text-slate-700">Fecha real del pago
          <input required type="date" max={fechaHoyISO()} disabled={busy} value={fecha} onChange={e=>{setFecha(e.target.value);setSolicitud(crypto.randomUUID());}} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base" />
        </label>
        {fechaReferencia&&fecha<fechaReferencia&&<p className="rounded-xl bg-teal-50 p-3 text-xs leading-relaxed text-teal-800">Este registro aparecerá en el historial{objetivo.cuotaId?' y reducirá la cuota pendiente':''}. Su fecha es anterior al saldo de referencia, por lo que no volverá a modificar el saldo proyectado.</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm">Cancelar</button>
          <button disabled={busy||soloLectura||Boolean(objetivo.cuotaId&&!montoValido)} className="min-h-11 rounded-xl bg-teal-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Guardando…':'Confirmar pago'}</button>
        </div>
      </form>
    </div>
  </AnimatedModal>;
}
