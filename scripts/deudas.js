const money = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(n));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel = date => date.split('-').reverse().join('/');
const cents = value => Math.round(Number(value)*100);
let debts = [], categories = [], filter = 'todas', modal, saving = false, editingId = null;
const $ = id => document.getElementById(id);
async function api(action, body) {
    const response = await fetch(`gestion_deudas.php?action=${action}`,body === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo completar la operación.');
    return result;
}
async function loadDebts() {
    try {
        const opened = [...document.querySelectorAll('details[open]')].map(el=>el.dataset.deuda);
        const result = await api('listar'); debts = result.deudas;
        $('deuda-error').classList.add('d-none');
        renderDebts(opened);
        window.dispatchEvent(new Event('programados-cambio'));
    } catch(error) { $('deuda-error').textContent=error.message; $('deuda-error').classList.remove('d-none'); }
}
function renderDebts(opened=[]) {
    const total = debts.reduce((s,d)=>s+cents(d.total),0), paid = debts.reduce((s,d)=>s+cents(d.pagado),0);
    const overdue = debts.flatMap(d=>d.cuotas).filter(c=>c.estado==='vencida').reduce((s,c)=>s+cents(c.pendiente),0);
    const remaining = debts.flatMap(d=>d.cuotas).filter(c=>c.estado!=='pagada'&&c.estado!=='omitida').length;
    $('resumen-deudas').innerHTML = [['Saldo pendiente',money((total-paid)/100)],['Total abonado',money(paid/100)],['Vencimientos pendientes',remaining],['Importe vencido',money(overdue/100)]].map(([label,value])=>`<div class="col-6 col-lg-3"><div class="debt-stat"><small>${label}</small><strong>${value}</strong></div></div>`).join('');
    const visible=debts.filter(d=>filter==='todas'||(filter==='pagadas'?Number(d.pendiente)===0:Number(d.pendiente)>0));
    if (!visible.length) { $('lista-deudas').innerHTML='<div class="debt-empty"><i class="fas fa-calendar-check d-block"></i><h2 class="h5 fw-bold">'+(debts.length?'No hay cronogramas en este filtro':'Tu próximo objetivo, bajo control')+'</h2><p class="text-muted mb-0">Crea un cronograma para llevar el avance de tus cuotas y sus pagos.</p></div>'; return; }
    $('lista-deudas').innerHTML=visible.map(d=>{
        const percent=cents(d.total)?Math.round(cents(d.pagado)/cents(d.total)*100):0;
        const continuo=d.modalidad && d.modalidad!=='cuotas';
        const info=modalityInfo(d.modalidad,d.fin);
        const period=generatedPeriod(d.cuotas);
        const next=d.cuotas.filter(c=>c.estado!=='pagada'&&c.estado!=='omitida').sort((a,b)=>a.fecha.localeCompare(b.fecha))[0];
        return `<article class="debt-card schedule-card" id="deuda-${d.id}">
          <div class="schedule-heading"><div class="schedule-identity"><span class="schedule-mode">${esc(info.title)}${d.modalidad==='fecha'&&d.fin?' · '+dateLabel(d.fin):''}</span><h2>${esc(d.nombre)}</h2><div class="schedule-meta"><span>${esc(d.categoria_nombre||'Sin categoría')}</span><span>Recibido: ${money(d.monto_recibido)}</span><span>${info.total}: <strong>${money(d.total)}</strong></span></div></div>
          <div class="schedule-heading-side"><div class="schedule-balance"><span>${d.modalidad==='continuo'?'Pendiente del período':'Pendiente'}</span><strong>${money(d.pendiente)}</strong></div><div class="schedule-tools" aria-label="Administrar ${esc(d.nombre)}">
           <button type="button" class="schedule-icon" data-action="condiciones" data-id="${d.id}" title="Duración e importe" aria-label="Duración e importe de ${esc(d.nombre)}"><i class="fas fa-sliders" aria-hidden="true"></i></button>
           <button type="button" class="schedule-icon" data-action="editar_deuda" data-id="${d.id}" title="Editar cronograma" aria-label="Editar cronograma de ${esc(d.nombre)}"><i class="fas fa-pen" aria-hidden="true"></i></button>
           <button type="button" class="schedule-icon schedule-icon-danger" data-action="eliminar" data-id="${d.id}" title="Eliminar cronograma" aria-label="Eliminar cronograma de ${esc(d.nombre)}"><i class="far fa-trash-can" aria-hidden="true"></i></button>
          </div></div></div>
          <details data-deuda="${d.id}" ${opened.includes(String(d.id)) || visible.length===1?'open':''}><summary class="schedule-summary">
           <div class="schedule-progress-label"><span><strong>${d.cuotas_pagadas}${continuo?'':' de '+d.cuotas.filter(c=>!c.omitida).length}</strong> ${d.cuotas_pagadas===1&&continuo?'pago realizado':'pagos realizados'} · ${d.cuotas.filter(c=>!c.omitida).length-d.cuotas_pagadas} por completar${continuo?' en el período generado':''}</span><span>${percent}% abonado${d.modalidad==='continuo'?' del período':''}</span></div>
           <div class="progress" role="progressbar" aria-label="${d.modalidad==='continuo'?'Importe abonado del período generado':'Importe abonado'}" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${percent}%"></div></div>
           <div class="schedule-summary-bottom"><span class="schedule-next"><i class="far fa-calendar" aria-hidden="true"></i>${next?`Próximo pago: ${continuo?'vencimiento':'cuota'} ${next.numero} · ${dateLabel(next.fecha)} · <strong>${money(next.pendiente)}</strong>`:(d.modalidad==='continuo'?'Sin pagos pendientes en el período generado.':'Sin vencimientos pendientes.')}</span><span class="schedule-expand"><span class="schedule-when-closed">Ver vencimientos</span><span class="schedule-when-open">Ocultar vencimientos</span><i class="fas fa-chevron-down debt-chevron" aria-hidden="true"></i></span></div>
          </summary><div class="table-responsive schedule-grid-shell"><table class="table agenda-grid schedule-grid align-middle" aria-label="Vencimientos de ${esc(d.nombre)}"><thead><tr><th scope="col">${continuo?'N.º':'Cuota'}</th><th scope="col">Vencimiento</th><th scope="col">Importe</th><th scope="col">Abonado</th><th scope="col">Pendiente</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${d.cuotas.map(c=>row(d,c)).join('')}</tbody></table></div>
          <div class="debt-card-footer"><strong>${esc(info.title)}</strong> · ${esc(info.help)}${d.modalidad==='continuo'?' Período generado: '+esc(period)+'.':''}<br>Los pagos generan gastos; el saldo pendiente se incluye en la proyección.</div></details></article>`;

    }).join('');
}
function row(d,c) {
    const labels={omitida:'Omitido',pagada:'Pagado',vencida:Number(c.pagado)>0?'Vencido · parcial':'Vencido',parcial:'Pago parcial',pendiente:'Pendiente'};
    const stateClass={pagada:'paid',vencida:'overdue',parcial:'partial',pendiente:'pending',omitida:'omitted'}[c.estado];
    const iconAction=(action,icon,label)=>`<button type="button" class="schedule-icon" data-action="${action}" data-id="${c.id}" title="${label}" aria-label="${label} ${c.numero} de ${esc(d.nombre)}"><i class="${icon}" aria-hidden="true"></i></button>`;
    const history=c.pagos.length?`<details class="schedule-payment-history"><summary class="agenda-action agenda-action-detail"><i class="far fa-file-lines" aria-hidden="true"></i>Pagos (${c.pagos.length})</summary><div class="schedule-payments-list">${c.pagos.map(p=>`<div class="schedule-payment"><span><time datetime="${p.fecha}">${dateLabel(p.fecha)}</time><strong>${money(p.monto)}</strong></span><button type="button" class="agenda-action agenda-action-undo" data-action="anular" data-id="${p.id}" aria-label="Anular pago de ${money(p.monto)} del ${dateLabel(p.fecha)}">Anular</button></div>`).join('')}</div></details>`:'';
    return `<tr class="agenda-row ${stateClass}"><td data-label="${d.modalidad==='cuotas'?'Cuota':'Vencimiento'}" class="schedule-number">${c.numero}${d.modalidad==='cuotas'?'/'+d.cuotas.length:''}</td><td data-label="Vencimiento" class="agenda-date"><time datetime="${c.fecha}">${dateLabel(c.fecha)}</time></td><td data-label="Importe" class="agenda-money">${money(c.monto)}</td><td data-label="Abonado" class="agenda-money ${Number(c.pagado)?'':'agenda-zero'}">${money(c.pagado)}</td><td data-label="Pendiente" class="agenda-money ${Number(c.pendiente)?'agenda-outstanding':'agenda-zero'}">${money(c.pendiente)}</td><td data-label="Estado"><span class="agenda-status ${stateClass}"><span class="agenda-status-dot" aria-hidden="true"></span>${labels[c.estado]}</span></td><td data-label="Acciones" class="agenda-actions-cell"><div class="schedule-row-actions">${c.estado!=='pagada'&&c.estado!=='omitida'?`<button type="button" class="agenda-action agenda-action-pay" data-action="pagar" data-id="${c.id}" aria-label="Registrar pago del vencimiento ${c.numero} de ${esc(d.nombre)}"><i class="fas fa-plus" aria-hidden="true"></i>Registrar pago</button>`:''}${!c.pagos.length?iconAction('editar','fas fa-pen','Editar vencimiento'):''}${!c.pagos.length?iconAction('omitir',c.omitida?'fas fa-rotate-left':'far fa-calendar-xmark',c.omitida?'Restaurar vencimiento':'Omitir vencimiento'):''}${history}</div></td></tr>`;
}

function openCreate() {
    setEditMode(null);
    $('form-deuda').reset(); $('borrador-cuotas').innerHTML=''; $('resumen-borrador').textContent='Genera las cuotas para revisar tu cronograma.'; $('error-borrador').classList.add('d-none');
    $('deuda-inicio').value=localDate();syncMonthEnd();
    $('deuda-modalidad').value='cuotas';$('deuda-fin').value=localDate().slice(0,7);modeChanged();
    $('deuda-categoria').innerHTML='<option value="">Sin categoría</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    modal.show();
}
function setEditMode(id) {
    editingId=id;
    $('titulo-deuda').textContent=id?'Editar cronograma':'Nuevo cronograma';
    $('guardar-deuda').textContent=id?'Guardar cambios':'Guardar cronograma';
    $('columna-abonos').textContent=id?'Abonado':'Ya pagada';
    $('columna-estado-cuota').textContent=id?'Edición':'Fecha del pago';
    $('generador-cronograma').classList.toggle('d-none',Boolean(id));
    $('generador-cronograma').querySelectorAll('input,select,button').forEach(el=>el.disabled=Boolean(id));
    $('ayuda-edicion').classList.toggle('d-none',!id);
    $('acciones-edicion').classList.toggle('d-none',!id||debts.find(d=>d.id===id)?.modalidad!=='cuotas');
    $('ayuda-pagos-iniciales').classList.toggle('d-none',Boolean(id));
}
function editRow(c,index) {
    const locked=(c.pagos||[]).length>0;
    return `<tr data-id="${c.id||0}" data-pagado="${cents(c.pagado||0)}" data-pagos="${(c.pagos||[]).length}"><td>${index+1}</td><td><input class="form-control form-control-sm draft-date" type="date" min="1900-01-01" max="2199-12-31" value="${c.fecha}" required ${locked?'disabled':''} aria-label="Vencimiento cuota ${index+1}"></td><td><input class="form-control form-control-sm draft-amount" type="number" min="0.01" max="99999999.99" step="0.01" value="${c.monto}" required ${locked?'disabled':''} aria-label="Importe cuota ${index+1}"></td><td><span class="small ${locked?'text-success':'text-muted'}">${locked?money(c.pagado):'Sin pagos'}</span></td><td class="small text-muted">${locked?'Conserva sus abonos':'Editable'}</td></tr>`;
}
function openEdit(id) {
    const debt=debts.find(d=>d.id===id); if(!debt)return;
    $('form-deuda').reset(); setEditMode(id);
    $('deuda-nombre').value=debt.nombre; $('deuda-recibido').value=debt.monto_recibido;
    $('deuda-categoria').innerHTML='<option value="">Sin categoría</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    $('deuda-categoria').value=debt.categoria_id||'';
    $('borrador-cuotas').innerHTML=debt.cuotas.map(editRow).join('');
    $('error-borrador').classList.add('d-none'); updateDraft(); modal.show();
}
function appendQuota() {
    const rows=[...$('borrador-cuotas').rows]; if(rows.length>=360)return;
    const last=rows.at(-1), date=last.querySelector('.draft-date').value;
    if(!date||Number(last.querySelector('.draft-amount').value)<=0){draftError('Completa fecha e importe de la última cuota antes de agregar otra.');return;}
    const [year,month,day]=date.split('-').map(Number);
    const next=new Date(year,month,(debts.find(d=>d.id===editingId)?.fin_mes?new Date(year,month+1,0).getDate():Math.min(day,new Date(year,month+1,0).getDate())),12);
    const iso=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
    $('borrador-cuotas').insertAdjacentHTML('beforeend',editRow({fecha:iso,monto:last.querySelector('.draft-amount').value},rows.length));
    updateDraft();
}
function generate() {
    const first=$('deuda-inicio').value; let count=Number($('deuda-cantidad').value); const amount=Number($('deuda-importe').value), freq=$('deuda-frecuencia').value;
    if (!first || ($('deuda-modalidad').value==='cuotas'&&(!Number.isInteger(count) || count<1 || count>360)) || !Number.isFinite(amount) || amount<=0 || amount>99999999.99) { draftError('Indica primer vencimiento, cantidad de cuotas e importe válidos.'); return; }
    const [year,month,day]=first.split('-').map(Number);
    const mode=$('deuda-modalidad').value;
    if(mode!=='cuotas'){
        const horizon=new Date();horizon.setDate(1);horizon.setMonth(horizon.getMonth()+12);const end=mode==='fecha'?monthEnd($('deuda-fin').value):monthEnd(`${horizon.getFullYear()}-${String(horizon.getMonth()+1).padStart(2,'0')}`);
        if(!end||end<first){draftError('Indica un último mes igual o posterior al inicio.');return;}
        count=0;for(let i=0;i<360;i++){const dt=freq==='mensual'?new Date(year,month-1+i,($('deuda-fin-mes').checked?new Date(year,month+i,0).getDate():Math.min(day,new Date(year,month+i,0).getDate())),12):new Date(year,month-1,day+i*(freq==='semanal'?7:15),12);if(dt>new Date(end+'T23:59:59'))break;count++;}
        if(!count){draftError('El período no contiene vencimientos.');return;}
    }

    $('borrador-cuotas').innerHTML=Array.from({length:count},(_,i)=>{
        let date;
        if(freq==='mensual') { const last=new Date(year,month+i,0).getDate(); date=new Date(year,month-1+i,($('deuda-fin-mes').checked?last:Math.min(day,last)),12); }
        else date=new Date(year,month-1,day+i*(freq==='semanal'?7:15),12);
        const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        return `<tr><td>${i+1}${mode==='cuotas'?'/'+count:''}</td><td><input class="form-control form-control-sm draft-date" type="date" value="${iso}" min="1900-01-01" max="2199-12-31" required aria-label="Vencimiento cuota ${i+1}"></td><td><input class="form-control form-control-sm draft-amount" type="number" min="0.01" max="99999999.99" step="0.01" value="${amount.toFixed(2)}" required aria-label="Importe cuota ${i+1}"></td><td class="text-center"><input class="form-check-input draft-paid" type="checkbox" aria-label="Cuota ${i+1} ya pagada"></td><td><input class="form-control form-control-sm draft-paid-date" type="date" value="${iso<=localDate()?iso:localDate()}" max="${localDate()}" min="1900-01-01" disabled aria-label="Fecha de pago cuota ${i+1}"></td></tr>`;
    }).join('');
    $('error-borrador').classList.add('d-none'); updateDraft();
}
function updateDraft() {
    const rows=[...$('borrador-cuotas').rows]; let total=0,paid=0;
    rows.forEach(row=>{const amount=cents(row.querySelector('.draft-amount').value)||0; total+=amount; if(editingId){paid+=Number(row.dataset.pagado||0);}else{if(row.querySelector('.draft-paid').checked)paid+=amount; row.querySelector('.draft-paid-date').disabled=!row.querySelector('.draft-paid').checked;}});
    $('quitar-cuota').disabled=rows.length<=1||Number(rows.at(-1)?.dataset.pagos||0)>0;
    $('agregar-cuota').disabled=rows.length>=360;
    const debt=editingId?debts.find(d=>d.id===editingId):null;
    const mode=debt?.modalidad||$('deuda-modalidad').value;
    const info=modalityInfo(mode,debt?.fin||monthEnd($('deuda-fin').value));
    $('columna-numero').textContent=mode==='cuotas'?'Cuota':'N.º';
    $('resumen-borrador').textContent=`${info.title} · ${rows.length} ${mode==='cuotas'?'cuotas':'vencimientos'+(mode==='continuo'?' proyectados':'')} · ${info.total}: ${money(total/100)} · Ya abonado: ${money(paid/100)} · Pendiente${mode==='continuo'?' del período':''}: ${money((total-paid)/100)}`+(mode==='continuo'?' · Período: '+generatedPeriod(rows.map(r=>({fecha:r.querySelector('.draft-date').value})))+'. Se ampliará automáticamente.':'');
}
function draftError(message) { $('error-borrador').textContent=message; $('error-borrador').classList.remove('d-none'); }
async function saveDebt(event) {
    event.preventDefault(); if(saving)return;
    if(!$('borrador-cuotas').rows.length){draftError('Genera y revisa el cronograma antes de guardar.');return;}
    saving=true; $('guardar-deuda').disabled=true;
    try {
        const cuotas=[...$('borrador-cuotas').rows].map(row=>({id:Number(row.dataset.id||0),fecha:row.querySelector('.draft-date').value,monto:row.querySelector('.draft-amount').value,...(!editingId?{pagada:row.querySelector('.draft-paid').checked,fecha_pago:row.querySelector('.draft-paid-date').value}:{})}));
        await api(editingId?'editar':'crear',{...(!editingId?{fin_mes:$('deuda-fin-mes').checked,modalidad:$('deuda-modalidad').value,frecuencia:$('deuda-frecuencia').value,inicio:$('deuda-inicio').value,fin:monthEnd($('deuda-fin').value),importe:$('deuda-importe').value}:{}),id:editingId,nombre:$('deuda-nombre').value,monto_recibido:$('deuda-recibido').value,categoria_id:$('deuda-categoria').value,cuotas});
        modal.hide(); await loadDebts();
    } catch(error){draftError(error.message);} finally {saving=false;$('guardar-deuda').disabled=false;}
}
async function handleAction(event) {
    const button=event.target.closest('[data-action]'); if(!button)return;
    const id=Number(button.dataset.id), action=button.dataset.action;
    if(action==='condiciones'){await changeConditions(id);return;}
    if(action==='omitir'){const c=debts.flatMap(d=>d.cuotas).find(c=>c.id===id);const confirm=await Swal.fire({title:c.omitida?'¿Restaurar vencimiento?':'¿Omitir vencimiento?',text:'Se actualizará el saldo proyectado. El vencimiento permanecerá en el detalle.',showCancelButton:true,cancelButtonText:'Cancelar',confirmButtonText:'Confirmar'});if(confirm.isConfirmed){try{await api('omitir',{id,restaurar:Boolean(c.omitida)});await loadDebts();}catch(e){Swal.fire('Error',e.message,'error');}}return;}
    if(action==='editar_deuda'){openEdit(id);return;}
    const debt=debts.find(d=>d.cuotas.some(c=>c.id===id)), quota=debt?.cuotas.find(c=>c.id===id);
    try {
        if(action==='pagar'||action==='editar') {
            const requestId=crypto.randomUUID();
            const result=await Swal.fire({title:action==='pagar'?`Pagar cuota ${quota.numero}`:`Editar cuota ${quota.numero}`,html:`<div class="debt-pay-form"><p class="small text-muted">${esc(debt.nombre)} · Pendiente: ${money(quota.pendiente)}</p><label for="pago-importe">${action==='pagar'?'Importe abonado':'Importe de la cuota'} (S/)</label><input id="pago-importe" class="swal2-input" type="number" step="0.01" min="0.01" value="${action==='pagar'?quota.pendiente:quota.monto}"><label for="pago-fecha">${action==='pagar'?'Fecha real del pago':'Vencimiento'}</label><input id="pago-fecha" class="swal2-input" type="date" min="1900-01-01" ${action==='pagar'?`max="${localDate()}"`:''} value="${action==='pagar'?localDate():quota.fecha}"><small>${action==='pagar'?'Puedes abonar una parte. Se registrará un gasto con esta fecha.':'Puedes ajustar fecha e importe mientras la cuota no tenga pagos.'}</small></div>`,showCancelButton:true,confirmButtonText:action==='pagar'?'Registrar pago':'Guardar cambios',cancelButtonText:'Cancelar',confirmButtonColor:'#13ad97',showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),preConfirm:async()=>{
                try{await api(action==='pagar'?'pagar':'editar_cuota',{cuota_id:id,id,monto:$('pago-importe').value,fecha:$('pago-fecha').value,solicitud:requestId});return true;}catch(error){Swal.showValidationMessage(error.message);return false;}
            }});
            if(result.isConfirmed)await loadDebts();
        } else {
            const target=debts.find(d=>d.id===id), hasPayments=action==='eliminar'&&Number(target?.pagado)>0;
            const confirmation=await Swal.fire({title:action==='anular'?'¿Anular este pago?':'¿Eliminar este cronograma?',text:action==='anular'?'Se quitará su gasto vinculado y el importe volverá a quedar pendiente.':hasPayments?'Se eliminarán el cronograma y todas sus cuotas pendientes. Elige qué hacer con los gastos ya pagados.':'Se eliminarán el cronograma y sus cuotas pendientes.',...(hasPayments?{input:'radio',inputOptions:{conservar:'Conservar los gastos ya pagados en el historial',eliminar:'Eliminar también los gastos de todos sus pagos'},inputValue:'conservar'}:{}),icon:'warning',showCancelButton:true,confirmButtonText:action==='anular'?'Sí, anular':'Sí, eliminar',cancelButtonText:'Cancelar',confirmButtonColor:'#c95046'});
            if(confirmation.isConfirmed){button.disabled=true;await api(action==='anular'?'anular_pago':'eliminar',{id,pagos:hasPayments?confirmation.value:'conservar'});await loadDebts();}
        }
    } catch(error){await Swal.fire('No se pudo guardar',error.message,'error');} finally {button.disabled=false;}
}
document.addEventListener('DOMContentLoaded',async()=>{
    modal=new bootstrap.Modal($('modal-deuda'));
    $('deuda-inicio').addEventListener('change',syncMonthEnd);
    $('deuda-frecuencia').addEventListener('change',syncMonthEnd);
    $('deuda-modalidad').addEventListener('change',modeChanged);
    $('nueva-deuda').addEventListener('click',openCreate); $('generar-cuotas').addEventListener('click',generate);
    $('borrador-cuotas').addEventListener('input',updateDraft); $('form-deuda').addEventListener('submit',saveDebt);
    $('agregar-cuota').addEventListener('click',appendQuota);
    $('quitar-cuota').addEventListener('click',()=>{const last=$('borrador-cuotas').lastElementChild;if($('borrador-cuotas').rows.length>1&&Number(last.dataset.pagos||0)===0){last.remove();updateDraft();}});
    $('lista-deudas').addEventListener('click',handleAction);
    document.querySelectorAll('[data-filtro]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filtro;document.querySelectorAll('[data-filtro]').forEach(b=>b.classList.toggle('active',b===button));renderDebts();}));
    try{const response=await fetch('obtener_datos.php',{cache:'no-store'});const data=await response.json();if(!data.success)throw new Error(data.error);categories=data.categorias||[];}catch(error){$('deuda-error').textContent=error.message;$('deuda-error').classList.remove('d-none');}
    await loadDebts(); window.addEventListener('focus',()=>{if(!document.querySelector('.modal.show')&&!Swal.isVisible())loadDebts();});
});

function monthEnd(value){if(!/^\d{4}-\d{2}$/.test(value))return '';const [y,m]=value.split('-').map(Number);return `${value}-${new Date(y,m,0).getDate()}`;}
function modeChanged(){
 const mode=$('deuda-modalidad').value, info=modalityInfo(mode);
 $('limite-cronograma').hidden=mode!=='fecha';$('deuda-fin').required=mode==='fecha';$('deuda-cantidad').disabled=mode!=='cuotas';
 $('campo-cantidad').hidden=mode!=='cuotas';$('label-importe').textContent=mode==='cuotas'?'Importe por cuota (S/)':'Importe por pago (S/)';
 $('ayuda-modalidad').textContent=info.help;
 $('columna-numero').textContent=mode==='cuotas'?'Cuota':'N.º';
 $('generar-cuotas').textContent=mode==='cuotas'?'Generar cuotas':'Generar vencimientos';
 // Una vista previa corresponde a una modalidad concreta: al cambiarla debe regenerarse.
 $('borrador-cuotas').innerHTML='';$('resumen-borrador').textContent='Genera '+(mode==='cuotas'?'las cuotas':'los vencimientos')+' para revisar tu cronograma.';
}
function modalityInfo(mode,fin){
 if(mode==='continuo')return {title:'Hasta cancelar',total:'Importe del período',help:'Compromiso sin fecha de término. Se generan vencimientos para el mes actual y los próximos 12 meses, y se amplía automáticamente al avanzar el calendario. El total mostrado corresponde al período generado.'};
 if(mode==='fecha')return {title:'Con fecha de término',total:'Total programado',help:'Se generan pagos hasta el último mes indicado, incluido. Después de ese límite no se generan nuevos vencimientos. Puedes editar el límite desde Duración e importe.'};
 return {title:'Cantidad definida de cuotas',total:'Total a pagar',help:'Este compromiso tiene un número definido de cuotas. El cronograma termina al completar esas cuotas; no se agregan nuevas automáticamente.'};
}
function generatedPeriod(items){const dates=items.map(c=>c.fecha).filter(Boolean).sort();return dates.length?dateLabel(dates[0])+' al '+dateLabel(dates.at(-1)):'sin vencimientos';}

async function changeConditions(id){
 const d=debts.find(d=>d.id===id);
 const result=await Swal.fire({title:'Duración e importe',html:`<div class="text-start"><label for="cond-modo">Duración</label><select id="cond-modo" class="form-select"><option value="continuo" ${d.modalidad==='continuo'?'selected':''}>Hasta cancelar</option><option value="fecha" ${d.modalidad!=='continuo'?'selected':''}>Hasta el último mes indicado</option></select>${d.modalidad==='cuotas'?'<label for="cond-freq" class="mt-3">Frecuencia al convertir el cronograma</label><select id="cond-freq" class="form-select"><option value="mensual">Mensual</option><option value="quincenal">Cada 15 días</option><option value="semanal">Semanal</option></select>':''}<label for="cond-fin" class="mt-3">Último mes (incluido)</label><input id="cond-fin" type="month" class="form-control" value="${d.fin?d.fin.slice(0,7):d.cuotas.at(-1)?.fecha.slice(0,7)||localDate().slice(0,7)}"><label for="cond-importe" class="mt-3">Importe de los próximos pagos</label><input id="cond-importe" class="form-control" type="number" step="0.01" value="${(d.tarifas?JSON.parse(d.tarifas).at(-1)?.monto:null)||d.importe||d.cuotas.at(-1)?.monto||0}"><label for="cond-desde" class="mt-3">Aplicar importe desde</label><input id="cond-desde" class="form-control" type="date" value="${localDate()}"><p class="small text-muted mt-3">Al acortar el plazo se retiran solo los vencimientos sin abonos posteriores al límite. Los pagos realizados conservan sus importes y fechas.</p></div>`,showCancelButton:true,cancelButtonText:'Cancelar',confirmButtonText:'Guardar cambios',showLoaderOnConfirm:true,preConfirm:async()=>{try{await api('configurar',{id,frecuencia:$('cond-freq')?.value||d.frecuencia,modalidad:$('cond-modo').value,fin:monthEnd($('cond-fin').value),importe:$('cond-importe').value,desde:$('cond-desde').value});return true;}catch(e){Swal.showValidationMessage(e.message);return false;}}});
 if(result.isConfirmed)await loadDebts();
}

function syncMonthEnd(){
 const date=$('deuda-inicio').value, monthly=$('deuda-frecuencia').value==='mensual';
 $('opcion-fin-mes').hidden=!monthly;
 $('deuda-fin-mes').checked=monthly&&Boolean(date)&&date===monthEnd(date.slice(0,7));
}
