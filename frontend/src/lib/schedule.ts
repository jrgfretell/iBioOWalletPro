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
