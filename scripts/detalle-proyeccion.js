const detalleMeses = new Map();
let mesDetalleActual = null, ultimoBotonDetalle = null;
const tramosProyeccion = ['Antes del 15','Día 15','Después del 15','Fin de mes (30/31)'];
function tramoProyeccion(fecha) {
    const dia=Number(fecha.slice(8)),[y,m]=fecha.split('-').map(Number),ultimo=new Date(y,m,0).getDate();
    return dia<15?0:dia===15?1:dia<30&&dia<ultimo?2:3;
}
function enlaceTramo(filas, mes, tramo) {
    const grupo=filas.filter(m=>tramoProyeccion(m.fecha)===tramo);
    const gastos=grupo.filter(m=>m.tipo==='gasto'),ingresos=grupo.filter(m=>m.tipo==='ingreso');
    const sum=list=>list.reduce((s,m)=>s+Math.round(m.monto*100),0)/100;
    return `<button class="projection-breakdown" type="button" data-detalle-mes="${mes}" data-tramo="${tramo}" aria-label="Ver desglose de ${tramosProyeccion[tramo]}">${gastos.length} ${gastos.length===1?'pago':'pagos'} · ${formatearMoneda(sum(gastos))}${ingresos.length?' · '+ingresos.length+(ingresos.length===1?' ingreso · ':' ingresos · ')+formatearMoneda(sum(ingresos)):''}<span>Ver desglose <i class="fas fa-arrow-right" aria-hidden="true"></i></span></button>`;
}
function abrirDetalleMes(mes,tramo='todos',opener=null) {
    if(!detalleMeses.has(mes))return;
    mesDetalleActual=mes;ultimoBotonDetalle=opener||document.activeElement;
    document.getElementById('detalle-tramo').value=String(tramo);
    document.getElementById('detalle-estado').value='todos';
    document.getElementById('detalle-buscar').value='';
    document.getElementById('detalle-incluidos').checked=false;
    renderDetalleMes();
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('panel-detalle-mes')).show();
}
function renderDetalleMes() {
    const datos=detalleMeses.get(mesDetalleActual);if(!datos)return;
    const $=id=>document.getElementById(id),escape=escaparCuota;
    $('detalle-titulo').textContent=datos.titulo;
    $('detalle-origen').textContent=datos.referencia?'Proyección desde el saldo real al '+datos.referencia.split('-').reverse().join('/')+'. Los movimientos anteriores ya están incluidos en ese saldo.':'Movimientos realizados y compromisos previstos para este mes.';
    $('detalle-incluidos-wrap').hidden=!datos.incluidos.length;
    $('detalle-incluidos-cantidad').textContent=datos.incluidos.length;
    const tramo=$('detalle-tramo').value,estado=$('detalle-estado').value,query=$('detalle-buscar').value.trim().toLocaleLowerCase('es');
    const filas=[...datos.filas,...($('detalle-incluidos').checked?datos.incluidos:[])].filter(m=>(tramo==='todos'||tramoProyeccion(m.fecha)===Number(tramo))&&(estado==='todos'||m.estado===estado)&&(!query||m.descripcion.toLocaleLowerCase('es').includes(query))).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.descripcion.localeCompare(b.descripcion));
    const aplicables=filas.filter(m=>!m.incluido),sum=tipo=>aplicables.filter(m=>m.tipo===tipo).reduce((s,m)=>s+Math.round(m.monto*100),0)/100;
    const historicos=filas.filter(m=>m.incluido),sumHist=tipo=>historicos.filter(m=>m.tipo===tipo).reduce((s,m)=>s+Math.round(m.monto*100),0)/100;
    $('detalle-totales').innerHTML=`<div><small>Ingresos en la proyección</small><strong class="text-success">+${formatearMoneda(sum('ingreso'))}</strong></div><div><small>Gastos en la proyección</small><strong class="text-danger">−${formatearMoneda(sum('gasto'))}</strong></div>${historicos.length?`<p class="small text-muted mb-0" style="grid-column:1/-1">Ya incluidos en saldo real: ${formatearMoneda(sumHist('ingreso'))} en ingresos y ${formatearMoneda(sumHist('gasto'))} en gastos. Se muestran solo para consulta.</p>`:''}`;
    $('detalle-conteo').textContent=`${filas.length} movimientos encontrados · Totales de los resultados que afectan la proyección.`;
    $('detalle-lista').innerHTML=filas.map(m=>`<li class="projection-movement ${m.incluido?'is-included':''}"><div class="projection-movement-date">${m.fecha.split('-').reverse().join('/')}</div><div class="projection-movement-name"><strong>${escape(m.descripcion)}</strong><div><span class="badge ${m.estado==='realizado'?'bg-success-subtle text-success':'bg-warning-subtle text-dark'}">${m.estado==='realizado'?'Realizado':'Programado · pendiente'}</span>${m.incluido?' <span class="badge bg-secondary-subtle text-secondary">Incluido en saldo real</span>':''}</div></div><strong class="projection-movement-amount ${m.tipo==='ingreso'?'text-success':'text-danger'}">${m.tipo==='ingreso'?'+':'−'}${formatearMoneda(m.monto)}</strong></li>`).join('')||'<li class="text-center text-muted py-5">No hay movimientos con estos filtros.</li>';
}
document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('contenedor-proyecciones').addEventListener('click',event=>{
        const button=event.target.closest('[data-detalle-mes]');if(button)abrirDetalleMes(button.dataset.detalleMes,button.dataset.tramo||'todos',button);
    });
    ['detalle-tramo','detalle-estado','detalle-incluidos'].forEach(id=>document.getElementById(id).addEventListener('change',renderDetalleMes));
    document.getElementById('detalle-buscar').addEventListener('input',renderDetalleMes);
    document.getElementById('panel-detalle-mes').addEventListener('hidden.bs.offcanvas',()=>{if(ultimoBotonDetalle?.isConnected)ultimoBotonDetalle.focus();});
});

let estadosTarjetas={};
try {estadosTarjetas=JSON.parse(localStorage.getItem('wallet_tarjetas_abiertas')||'{}')||{};}catch(e){}
function estadoTarjetaMes(mes,actual){return Object.prototype.hasOwnProperty.call(estadosTarjetas,mes)?Boolean(estadosTarjetas[mes]):actual;}
function guardarEstadoTarjeta(details){
 estadosTarjetas[details.dataset.mes]=details.open;
 try{localStorage.setItem('wallet_tarjetas_abiertas',JSON.stringify(estadosTarjetas));}catch(e){}
 const button=document.getElementById('alternar-tarjetas');
 if(button)button.textContent=document.querySelector('.projection-fold[open]')?'Contraer todos':'Expandir todos';
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('alternar-tarjetas').addEventListener('click',()=>{
  const abrir=!document.querySelector('.projection-fold[open]');
  document.querySelectorAll('.projection-fold').forEach(d=>{d.open=abrir;guardarEstadoTarjeta(d);});
 });
});
