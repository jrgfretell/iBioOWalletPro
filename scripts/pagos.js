let agendaMovements = [], agendaLoading = false, agendaReload = false;
function selectPanel() {
    const hash=location.hash.slice(1), name=(hash.startsWith('deuda-')||hash==='recurrentes')?'cuotas':['agenda','recurrentes','cuotas','ingresos'].includes(hash)?hash:'agenda';
    document.querySelectorAll('[data-panel]').forEach(a=>{const active=a.dataset.panel===name;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    ['agenda','recurrentes','cuotas','ingresos'].forEach(p=>$('panel-'+p).hidden=p!==name);
    if(hash.startsWith('deuda-')) {const el=$(hash);if(el){el.querySelector('details').open=true;el.scrollIntoView({block:'start'});}}
}
async function loadAgenda() {
    if(agendaLoading){agendaReload=true;return;}
    agendaLoading=true;
    try {
        const response=await fetch('obtener_datos.php',{cache:'no-store'}), data=await response.json();
        if(!data.success)throw new Error(data.error||'No se pudo cargar la agenda.');
        agendaMovements=data.programadosRecurrentes||[];
        categories=data.categorias||[];
        renderAgenda(); $('agenda-error').classList.add('d-none'); selectPanel();
    }catch(error){$('agenda-error').textContent=error.message;$('agenda-error').classList.remove('d-none');}
    finally{agendaLoading=false;if(agendaReload){agendaReload=false;loadAgenda();}}
}
function agendaRows() {
    const recurrent=agendaMovements.filter(m=>m.tipo==='gasto').map(m=>({id:m.id,kind:'recurrente',date:m.fecha,name:m.descripcion,amount:cents(m.monto),paid:Number(m.pago_confirmado)?cents(m.monto):0,confirmed:m.fecha_pago,recId:m.recurrente_id}));
    const cuotas=debts.flatMap(d=>d.cuotas.filter(c=>!c.omitida).map(c=>({id:c.id,kind:d.modalidad||'cuotas',date:c.fecha,name:d.nombre,detail:d.modalidad==='cuotas'?`Cuota ${c.numero}/${d.cuotas.length}`:`Pago ${c.numero}`,amount:cents(c.monto),paid:cents(c.pagado),debtId:d.id})));
    return [...recurrent,...cuotas].map(r=>({...r,pending:r.amount-r.paid,status:r.paid===r.amount?'pagado':r.date<localDate()?'vencido':'pendiente'})).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
function renderIngresosProgramadosMes() {
    const selMesEl = $('sueldo-mes'), selAnioEl = $('sueldo-anio');
    const mesIdx = selMesEl ? parseInt(selMesEl.value, 10) : new Date().getMonth();
    const anio = selAnioEl ? parseInt(selAnioEl.value, 10) : new Date().getFullYear();
    const monthPrefix = `${anio}-${String(mesIdx + 1).padStart(2, '0')}`;
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const nombreMes = nombresMeses[mesIdx] || 'Mes';

    const txtHeader = $('otros-ingresos-mes-txt');
    if (txtHeader) txtHeader.textContent = `${nombreMes} ${anio}`;

    const sourceList = (agendaMovements && agendaMovements.length) ? agendaMovements : ((typeof AppState !== 'undefined' && AppState.programadosRecurrentes) ? AppState.programadosRecurrentes : []);
    const income = sourceList.filter(m => m.tipo === 'ingreso' && m.fecha.startsWith(monthPrefix));

    const totalOtros = income.reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
    const confirmados = income.filter(m => Number(m.pago_confirmado)).length;

    const kpiOtros = $('ingresos-kpi-otros-mes');
    const kpiOtrosDet = $('ingresos-kpi-otros-detalle');
    if (kpiOtros) kpiOtros.textContent = money(totalOtros);
    if (kpiOtrosDet) {
        kpiOtrosDet.textContent = income.length === 0
            ? 'Sin ingresos extra este mes'
            : `${confirmados} de ${income.length} confirmados`;
    }

    const container = $('ingresos-recurrentes');
    if (!container) return;

    if (income.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 px-3 bg-light border rounded-3">
                <i class="fas fa-coins text-muted mb-2" style="font-size: 1.4rem; opacity: 0.55;"></i>
                <p class="small text-muted mb-2">No tienes otros ingresos programados para <strong>${esc(nombreMes)} ${anio}</strong>.</p>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="abrirModalCrear('ingreso')">
                    <i class="fas fa-plus me-1"></i>Programar un ingreso fijo
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = income.map(m => {
        const recibido = Number(m.pago_confirmado) === 1;
        return `
            <div class="income-other-item">
                <div>
                    <div class="fw-bold text-dark d-flex align-items-center gap-2 flex-wrap">
                        <span>${esc(m.descripcion)}</span>
                        <span class="badge ${recibido ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'}" style="font-size: 0.65rem;">
                            ${recibido ? '<i class="fas fa-check me-1"></i>Recibido' : '<i class="fas fa-clock me-1"></i>Por recibir'}
                        </span>
                    </div>
                    <div class="small text-muted mt-1">
                        <i class="far fa-calendar me-1"></i>Programado: ${dateLabel(m.fecha)}
                        ${recibido && m.fecha_pago ? ` · Confirmado el ${dateLabel(m.fecha_pago)}` : ''}
                    </div>
                </div>
                <div class="income-other-actions d-flex align-items-center gap-2 flex-wrap">
                    <strong class="text-success me-1">${money(m.monto)}</strong>
                    ${!recibido
                        ? `<button class="btn btn-sm btn-accent" data-rec-confirm="${m.id}">Confirmar ingreso</button>`
                        : (m.fecha_pago ? `<button class="btn btn-sm btn-outline-danger" data-rec-undo="${m.id}">Anular</button>` : '')
                    }
                    ${m.recurrente_id ? `<button class="btn btn-sm btn-link text-secondary p-1" data-rec-edit="${m.recurrente_id}" title="Editar plantilla"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}
function renderAgenda() {
    const month=$('agenda-mes').value, type=$('agenda-tipo').value, state=$('agenda-estado').value;
    const monthRows=agendaRows().filter(r=>r.date.startsWith(month)&&(type==='todos'||(type==='continuo'?r.kind==='continuo'||r.kind==='fecha':r.kind===type)));
    const sum=key=>monthRows.reduce((total,r)=>total+r[key],0)/100;
    $('agenda-resumen').innerHTML=[['Programado del mes',sum('amount')],['Pagado de este mes',sum('paid')],['Pendiente',sum('pending')],['Vencido',monthRows.filter(r=>r.status==='vencido').reduce((s,r)=>s+r.pending,0)/100]].map(([label,value])=>`<div class="col-6 col-lg-3"><div class="debt-stat"><small>${label}</small><strong>${money(value)}</strong></div></div>`).join('');
    const rows=monthRows.filter(r=>state==='todos'||(state==='pendiente'?r.pending>0:r.status===state));
    $('agenda-filas').innerHTML=rows.map(r=>{
        const status=r.status==='pagado'?'Pagado':r.status==='vencido'?'Vencido':r.paid>0?'Pago parcial':'Pendiente';
        const stateClass=r.status==='pagado'?'paid':r.status==='vencido'?'overdue':r.paid>0?'partial':'pending';
        const tipo=r.kind==='cuotas'?'Cuotas':r.kind==='continuo'?'Continuo':r.kind==='fecha'?'Hasta fecha':'Recurrente';
        const pay=r.pending?`<button type="button" class="agenda-action agenda-action-pay" ${r.debtId?`data-action="pagar" data-id="${r.id}"`:`data-rec-confirm="${r.id}"`} aria-label="Registrar pago de ${esc(r.name)}"><i class="fas fa-plus" aria-hidden="true"></i> Registrar pago</button>`:'';
        const detail=r.debtId?`<a class="agenda-action agenda-action-detail" href="#deuda-${r.debtId}" aria-label="Ver cronograma de ${esc(r.name)}">Ver detalle <i class="fas fa-arrow-right" aria-hidden="true"></i></a>`:r.recId?`<button type="button" class="agenda-action agenda-action-detail" data-rec-edit="${r.recId}">Editar</button>`:'<span class="small text-muted">Sin compromiso activo</span>';
        const undo=!r.debtId&&!r.pending&&r.confirmed?`<button type="button" class="agenda-action agenda-action-undo" data-rec-undo="${r.id}">Anular pago</button>`:'';
        return `<tr class="agenda-row ${stateClass}"><td data-label="Vencimiento" class="agenda-date">${dateLabel(r.date)}</td><td data-label="Compromiso" class="agenda-commitment"><strong>${esc(r.name)}</strong><span>${esc(r.detail||'Pago recurrente')}</span></td><td data-label="Tipo"><span class="agenda-kind">${tipo}</span></td><td data-label="Programado" class="agenda-money">${money(r.amount/100)}</td><td data-label="Pagado" class="agenda-money ${r.paid?'':'agenda-zero'}">${money(r.paid/100)}</td><td data-label="Pendiente" class="agenda-money ${r.pending?'agenda-outstanding':'agenda-zero'}">${money(r.pending/100)}</td><td data-label="Estado"><span class="agenda-status ${stateClass}"><span class="agenda-status-dot" aria-hidden="true"></span>${status}</span></td><td data-label="Acciones" class="agenda-actions-cell"><div class="agenda-actions">${pay}${undo}${detail}</div></td></tr>`;
    }).join('')||'<tr><td colspan="8" class="agenda-empty"><i class="far fa-calendar-check" aria-hidden="true"></i><strong>No hay pagos para esta selección</strong><span>Prueba otro mes o cambia los filtros.</span></td></tr>';
    renderIngresosProgramadosMes();
}
async function recurringAction(event) {
    const edit=event.target.closest('[data-rec-edit]');if(edit){prepararEdicion(Number(edit.dataset.recEdit));return;}
    const button=event.target.closest('[data-rec-confirm],[data-rec-undo]');if(!button)return;
    const undo=button.hasAttribute('data-rec-undo'), id=Number(undo?button.dataset.recUndo:button.dataset.recConfirm), mov=agendaMovements.find(m=>m.id===id);
    if(!mov)return;
    const result=await Swal.fire({title:undo?'¿Anular este movimiento?':mov.tipo==='ingreso'?'Confirmar ingreso':'Registrar pago recurrente',text:undo?'Volverá a quedar pendiente y se retirará del historial realizado.':`${mov.descripcion} · ${money(mov.monto)}. Indica la fecha real.`,...(!undo?{input:'date',inputValue:localDate(),inputAttributes:{min:'1900-01-01',max:localDate()}}:{}),showCancelButton:true,cancelButtonText:'Cancelar',confirmButtonText:undo?'Anular':'Confirmar',showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),preConfirm:async fecha=>{
        try {const response=await fetch(`gestion_programados.php?action=${undo?'anular':'confirmar'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fecha})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error);return true;}catch(error){Swal.showValidationMessage(error.message);return false;}
    }});
    if(result.isConfirmed){await loadAgenda();await cargarDatosDesdeBD({preservarVista:true});}
}
document.addEventListener('DOMContentLoaded',()=>{
    $('agenda-mes').value=localDate().slice(0,7);
    ['agenda-mes','agenda-tipo','agenda-estado'].forEach(id=>$(id).addEventListener('change',renderAgenda));
    $('agenda-hoy').addEventListener('click',()=>{$('agenda-mes').value=localDate().slice(0,7);renderAgenda();});
    $('nuevo-programado').addEventListener('click',openCreate);
    $('agenda-filas').addEventListener('click',e=>{if(e.target.closest('[data-action]'))handleAction(e);else recurringAction(e);});
    $('ingresos-recurrentes').addEventListener('click',recurringAction);
    window.addEventListener('hashchange',selectPanel);window.addEventListener('programados-cambio',loadAgenda);
    window.addEventListener('focus',()=>{if(!document.querySelector('.modal.show')&&!Swal.isVisible())loadAgenda();});
    selectPanel();loadAgenda();
});
