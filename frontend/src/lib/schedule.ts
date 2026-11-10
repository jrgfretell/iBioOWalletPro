import { obtenerUltimoDiaMes } from '../types/wallet.ts';
export function generarCuotas(inicio:string,cantidad:number,monto:number,finDeMes:boolean) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!Number.isInteger(cantidad)||cantidad<1||cantidad>600||!Number.isFinite(monto)||monto<=0)return [];
  const [y,m,d]=inicio.split('-').map(Number);
  if(m<1||m>12||d<1||d>obtenerUltimoDiaMes(y,m-1))return [];
  return Array.from({length:cantidad},(_,i)=>{
    // La fecha elegida corresponde siempre a la primera cuota. La regla de
    // fin de mes solo afecta los vencimientos posteriores.
    if(i===0)return {monto,fecha:inicio};
    const date=new Date(y,m-1+i,1);const a=date.getFullYear(), mes=date.getMonth();
    const dia=finDeMes?obtenerUltimoDiaMes(a,mes):Math.min(d,obtenerUltimoDiaMes(a,mes));
    return {monto,fecha:`${a}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`};
  });
}

export interface CuotaParaRedistribuir { id:number; numero:number; fecha:string; monto:number; abonado:number; }
export interface CambioImporteCuota { id:number; numero:number; fecha:string; montoAnterior:number; montoNuevo:number; abonado:number; }

export function redistribuirImportesPosteriores(cuotas:CuotaParaRedistribuir[],cuotaId:number,importeNuevo:number):
  {ok:true;totalCronograma:number;cambios:CambioImporteCuota[];redistribucion:{cuota_id:number;monto:number}[]}|{ok:false;motivo:string} {
  const aCentavos=(valor:number)=>Math.round((valor+Number.EPSILON)*100);
  const aMoneda=(centavos:number)=>centavos/100;
  const ordenadas=[...cuotas].sort((a,b)=>a.numero-b.numero);
  const indice=ordenadas.findIndex(cuota=>cuota.id===cuotaId);
  if(indice<0)return {ok:false,motivo:'No se encontró la cuota seleccionada.'};
  const seleccionada=ordenadas[indice];
  const nuevoCentavos=aCentavos(importeNuevo);
  const abonadoSeleccionada=aCentavos(seleccionada.abonado);
  if(!Number.isFinite(nuevoCentavos)||nuevoCentavos<=0)return {ok:false,motivo:'El importe debe ser mayor que cero y tener hasta dos decimales.'};
  if(nuevoCentavos<abonadoSeleccionada)return {ok:false,motivo:'El importe no puede ser menor que lo que ya se abonó a esta cuota.'};
  const anterioresCentavos=ordenadas.map(cuota=>aCentavos(cuota.monto));
  const totalCentavos=anterioresCentavos.reduce((suma,monto)=>suma+monto,0);
  const seleccionadoCentavos=anterioresCentavos[indice];
  if(nuevoCentavos===seleccionadoCentavos)return {ok:true,totalCronograma:aMoneda(totalCentavos),cambios:[],redistribucion:[]};

  const posteriores=ordenadas.slice(indice+1);
  const ajustables=posteriores.filter(cuota=>aCentavos(cuota.abonado)<aCentavos(cuota.monto));
  const abonadas=posteriores.filter(cuota=>aCentavos(cuota.abonado)>=aCentavos(cuota.monto));
  if(!ajustables.length)return {ok:false,motivo:'No hay cuotas posteriores pendientes para compensar este cambio sin alterar el total pactado.'};
  const totalPosteriorOriginal=posteriores.reduce((suma,cuota)=>suma+aCentavos(cuota.monto),0);
  const totalPosteriorAbonado=abonadas.reduce((suma,cuota)=>suma+aCentavos(cuota.monto),0);
  let porRedistribuir=seleccionadoCentavos+totalPosteriorOriginal-nuevoCentavos-totalPosteriorAbonado;
  const pisos=ajustables.map(cuota=>Math.max(1,aCentavos(cuota.abonado)));
  if(porRedistribuir<pisos.reduce((suma,piso)=>suma+piso,0))return {ok:false,motivo:'El cambio haría que alguna cuota quedara por debajo de lo ya abonado. Reduce el nuevo importe.'};

  const importesNuevos=new Array<number>(ajustables.length).fill(0);
  let activos=ajustables.map((_,i)=>i);
  while(activos.length){
    const base=Math.floor(porRedistribuir/activos.length);
    const saturados=activos.filter(i=>pisos[i]>base);
    if(saturados.length){
      for(const i of saturados){importesNuevos[i]=pisos[i];porRedistribuir-=pisos[i];}
      activos=activos.filter(i=>!saturados.includes(i));
      continue;
    }
    for(const i of activos)importesNuevos[i]=base;
    let centavosExtra=porRedistribuir-base*activos.length;
    for(const i of activos){if(centavosExtra<=0)break;importesNuevos[i]+=1;centavosExtra-=1;}
    break;
  }
  const cambios:CambioImporteCuota[]=[
    {id:seleccionada.id,numero:seleccionada.numero,fecha:seleccionada.fecha,montoAnterior:aMoneda(seleccionadoCentavos),montoNuevo:aMoneda(nuevoCentavos),abonado:seleccionada.abonado},
    ...ajustables.map((cuota,i)=>({id:cuota.id,numero:cuota.numero,fecha:cuota.fecha,montoAnterior:cuota.monto,montoNuevo:aMoneda(importesNuevos[i]),abonado:cuota.abonado}))
      .filter(cambio=>aCentavos(cambio.montoAnterior)!==aCentavos(cambio.montoNuevo)),
  ];
  return {ok:true,totalCronograma:aMoneda(totalCentavos),cambios,redistribucion:ajustables.map((cuota,i)=>({cuota_id:cuota.id,monto:aMoneda(importesNuevos[i])}))};
}
