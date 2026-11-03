const fechaLima = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const esOrigenProgramado = m => Boolean(m.cuota_id || m.es_recurrente);
const estaIncluidoEnSaldo = m => Boolean(AppState.fechaReferencia && (m.fecha < AppState.fechaReferencia || (m.fecha === AppState.fechaReferencia && AppState.movimientosIncluidos.has(String(m.id)))));
let AppState = {
    fechaReferencia:null,
    movimientosIncluidos:new Set(),
    categorias: [],
    movimientos: [],
    recurrentes: []
};

let modalMovimientoObj;
let guardandoMovimiento=false;
let ultimaVersionDatos = null;
let tabOrigenActual = 'todos'; // 'todos' | 'eventual' | 'fijo'

function cambiarTabOrigen(origen) {
    tabOrigenActual = origen;
    
    ['todos', 'eventual', 'fijo'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (btn) {
            if (t === origen) {
                btn.classList.add('active', 'fw-bold');btn.setAttribute('aria-pressed','true');
                btn.classList.remove('text-secondary');
            } else {
                btn.classList.remove('active', 'fw-bold');btn.setAttribute('aria-pressed','false');
                btn.classList.add('text-secondary');
            }
        }
    });

    filtrarMovimientos();
}

function actualizarResumenMovimientos(lista) {
    const ingresos = lista.filter(m => m.tipo === 'ingreso').reduce((total, m) => total + Number(m.monto), 0);
    const gastosFijos = lista.filter(m => m.tipo === 'gasto' && esOrigenProgramado(m)).reduce((total, m) => total + Number(m.monto), 0);
    const gastosEventuales = lista.filter(m => m.tipo === 'gasto' && !esOrigenProgramado(m)).reduce((total, m) => total + Number(m.monto), 0);
    const gastosTotales = gastosFijos + gastosEventuales;
    const neto = ingresos - gastosTotales;
    const signoNeto = neto >= 0 ? '+' : '-';
    const resumen = document.getElementById('resumen-movimientos');

    resumen.innerHTML = `
        <div class="movement-summary-item is-neutral">
            <span class="movement-summary-label"><i class="fas fa-list me-1"></i>Movimientos</span>
            <strong>${lista.length}</strong>
        </div>
        <div class="movement-summary-item is-income">
            <span class="movement-summary-label"><i class="fas fa-arrow-trend-up me-1"></i>Ingresos</span>
            <strong>+S/. ${ingresos.toFixed(2)}</strong>
        </div>
        <div class="movement-summary-item is-expense" title="Pagos realizados de cronogramas, incluidos los de origen programado anterior">
            <span class="movement-summary-label"><i class="fas fa-sync-alt me-1 text-primary"></i>Gastos de cronogramas</span>
            <strong>-S/. ${gastosFijos.toFixed(2)}</strong>
        </div>
        <div class="movement-summary-item is-expense" style="background: #fffdf5; border-color: #fef08a;" title="Gastos registrados manualmente">
            <span class="movement-summary-label"><i class="fas fa-receipt me-1 text-warning"></i>Gastos manuales</span>
            <strong style="color: #d97706;">-S/. ${gastosEventuales.toFixed(2)}</strong>
        </div>
        <div class="movement-summary-item ${neto >= 0 ? 'is-income' : 'is-expense'}">
            <span class="movement-summary-label"><i class="fas fa-scale-balanced me-1"></i>Neto filtrado</span>
            <strong>${signoNeto}S/. ${Math.abs(neto).toFixed(2)}</strong>
        </div>
    `;
}

// --- FILTRAR MOVIMIENTOS ---
function filtrarMovimientos() {
    const txt = document.getElementById('filtro-buscar').value.toLowerCase().trim();
    const catId = document.getElementById('filtro-categoria').value;
    const tipo = document.getElementById('filtro-tipo').value;
    const mes = document.getElementById('filtro-mes').value;
    const anio = document.getElementById('filtro-anio').value;

    const filtrados = AppState.movimientos.filter(m => {
        const fMov = new Date(m.fecha + 'T00:00:00');
        
        // Filtro origen (pestanas)
        let matchesOrigen = true;
        if (tabOrigenActual === 'eventual') {
            matchesOrigen = !esOrigenProgramado(m);
        } else if (tabOrigenActual === 'fijo') {
            matchesOrigen = esOrigenProgramado(m);
        }

        // Filtro texto
        const matchesTxt = m.descripcion.toLowerCase().includes(txt);
        // Filtro categoria
        const matchesCat = catId === "" || m.categoria_id == catId;
        // Filtro tipo
        const matchesTipo = tipo === "" || m.tipo === tipo;
        // Filtro mes
        const matchesMes = mes === "" || fMov.getMonth() == mes;
        // Filtro año
        const matchesAnio = anio === "" || fMov.getFullYear() == anio;

        return matchesOrigen && matchesTxt && matchesCat && matchesTipo && matchesMes && matchesAnio;
    });

    filtrados.sort((a, b) => new Date(b.fecha + 'T00:00:00') - new Date(a.fecha + 'T00:00:00') || Number(b.id) - Number(a.id));
    actualizarResumenMovimientos(filtrados);
    renderMovimientos(filtrados);
}

// --- LIMPIAR FILTROS ---
function limpiarFiltros() {
    document.getElementById('filtro-buscar').value = '';
    document.getElementById('filtro-categoria').value = '';
    document.getElementById('filtro-tipo').value = '';
    document.getElementById('filtro-mes').value = '';
    document.getElementById('filtro-anio').value = '';
    cambiarTabOrigen('todos');
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('reg-fecha').max=fechaLima();
    modalMovimientoObj = new bootstrap.Modal(document.getElementById('modal-movimiento'));
    
    const hoy = new Date();
    const anioInicio = hoy.getFullYear();

    // Llenar dinámicamente filtro-anio
    const selectFiltroAnio = document.getElementById('filtro-anio');
    if (selectFiltroAnio) {
        selectFiltroAnio.innerHTML = '<option value="">Todos</option>';
        for (let i = 0; i < 3; i++) {
            const opt = document.createElement('option');
            opt.value = anioInicio + i;
            opt.innerText = anioInicio + i;
            selectFiltroAnio.appendChild(opt);
        }
    }

    // Seleccionar por defecto el mes y año actual
    document.getElementById('filtro-mes').value = hoy.getMonth();
    document.getElementById('filtro-anio').value = hoy.getFullYear();

    document.getElementById('reg-fecha').value = fechaLima();
    
    cargarDatosDesdeBD();

    // Sincronizar automáticamente al enfocar la pestaña
    window.addEventListener('focus', () => {
        cargarDatosDesdeBD({ preservarVista: true });
    });
});

// --- FETCH: Obtener datos desde backend ---
function capturarVistaMovimientos() {
    return {
        categoriaId: document.getElementById('filtro-categoria').value,
        scrollTop: document.getElementById('lista-movimientos').scrollTop
    };
}

async function cargarDatosDesdeBD({ preservarVista = false } = {}) {
    const lista = document.getElementById('lista-movimientos');
    lista.setAttribute('aria-busy', 'true');
    try {
        const response = await fetch('obtener_datos.php?t=' + new Date().getTime());
        const res = await response.json();
        if(res.success) {
            const version = JSON.stringify([res.categorias || [], res.movimientos || [], res.recurrentes || [],res.fechaReferencia,res.movimientosIncluidos || []]);
            if (ultimaVersionDatos === version) return;
            const vista = preservarVista ? capturarVistaMovimientos() : null;
            AppState.categorias = res.categorias || [];
            AppState.movimientos = res.movimientos || [];
            AppState.recurrentes = res.recurrentes || [];
            AppState.fechaReferencia=res.fechaReferencia||null;
            AppState.movimientosIncluidos=new Set((res.movimientosIncluidos||[]).map(String));
            const aviso=document.getElementById('aviso-saldo-historial');
            aviso.classList.toggle('d-none',!AppState.fechaReferencia);
            aviso.textContent=AppState.fechaReferencia?'Saldo real de referencia: '+AppState.fechaReferencia.split('-').reverse().join('/')+'. Los registros identificados como incluidos se conservan en el historial y no vuelven a descontarse. El neto filtrado no equivale al saldo disponible.':'';
            const futuros=AppState.movimientos.filter(m=>m.fecha>fechaLima()).length;
            const futuroAviso=document.getElementById('aviso-fechas-futuras');futuroAviso.classList.toggle('d-none',!futuros);futuroAviso.textContent=futuros?`Hay ${futuros} registros antiguos con fecha futura. Consérvalos o revísalos para trasladarlos a Pagos programados; no son operaciones realizadas todavía.`:'';
            const years=new Set(AppState.movimientos.map(m=>m.fecha.slice(0,4)));
            const selectYear=document.getElementById('filtro-anio');
            [...years].sort().forEach(y=>{if(![...selectYear.options].some(o=>o.value===y)){const opt=new Option(y,y);selectYear.add(opt);}});
            
            llenarSelectCategorias(vista?.categoriaId);
            filtrarMovimientos(); // Filtrar y renderizar por defecto
            ultimaVersionDatos = version;
            if (vista) requestAnimationFrame(() => { document.getElementById('lista-movimientos').scrollTop = vista.scrollTop; });
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error de Conexión', 'No se pudo obtener datos del servidor.', 'error');
    } finally {
        lista.setAttribute('aria-busy', 'false');
    }
}

function llenarSelectCategorias(categoriaSeleccionada = '') {
    // Formulario
    const select = document.getElementById('reg-categoria');
    select.innerHTML = '';

    // Filtro
    const filterSelect = document.getElementById('filtro-categoria');
    filterSelect.innerHTML = '<option value="">Todas las Categorías</option>';

    if (AppState.categorias.length === 0) {
        select.innerHTML = '<option value="">Crea primero una categoría</option>';
        return;
    }

    AppState.categorias.forEach(cat => {
        // Formulario option
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.nombre;
        if(cat.nombre.toLowerCase() === 'otros') {
            opt.selected = true;
        }
        select.appendChild(opt);

        // Filtro option
        const optF = document.createElement('option');
        optF.value = cat.id;
        optF.innerText = cat.nombre;
        filterSelect.appendChild(optF);
    });
    filterSelect.value = categoriaSeleccionada;
}

function renderMovimientos(lista) {
    const listContainer = document.getElementById('lista-movimientos');
    listContainer.innerHTML = '';

    if(lista.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-muted py-4 small">No hay movimientos que coincidan con los filtros.</div>`;
        return;
    }

    lista.forEach(m => {
        const badgeClassMovil = m.tipo === 'ingreso' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const signo = m.tipo === 'ingreso' ? '+' : '-';
        
        const fParts = m.fecha.split('-');
        const fLegible = `${fParts[2]}/${fParts[1]}/${fParts[0]}`;

        // Categoría
        const catNombre = m.categoria_nombre || 'Otros';
        const catColor = m.categoria_color || '#7f8c8d';
        const catIcono = m.categoria_icono || 'fa-folder';
        const tienePlantilla = m.es_recurrente && AppState.recurrentes.some(r => r.id === m.recurrente_id);

        const card = document.createElement('div');
        card.className = 'p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center bg-white border-start border-4 movement-card';
        card.style.cssText = `border-left-color: ${catColor} !important; border-radius: 8px;`;
        card.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; background-color: ${catColor}15; border-radius: 50%; color: ${catColor}; font-size: 1.1rem; flex-shrink: 0;">
                    <i class="fas ${catIcono}"></i>
                </div>
                <div>
                    <div class="fw-bold text-dark" style="font-size: 0.9rem; line-height: 1.2;">${String(m.descripcion).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>
                    <div class="text-muted small" style="font-size: 0.72rem; margin-top: 2px;">
                        ${fLegible} • <span class="badge ${badgeClassMovil} p-1" style="font-size: 0.58rem; font-weight: 700; text-transform: uppercase;">${m.tipo}</span>
                        <span class="d-block mt-1">${esOrigenProgramado(m)?'Origen: cronograma':'Origen: manual'}${estaIncluidoEnSaldo(m)?' · <span class="badge bg-secondary-subtle text-secondary">Incluido en saldo real</span>':''}${m.fecha>fechaLima()?' · <span class="badge bg-warning text-dark">Fecha futura · revisar</span>':''}</span>
                    </div>
                </div>
            </div>
            <div class="text-end">
                <div class="fw-bold ${m.tipo === 'ingreso' ? 'text-success' : 'text-danger'}" style="font-size: 0.95rem;">
                    ${signo} S/. ${m.monto.toFixed(2)}
                </div>
                <div class="mt-1">
                    ${m.cuota_id ? `<a class="badge bg-info text-dark text-decoration-none" href="pagos.html#deuda-${m.deuda_id}">Pago programado · Ver cronograma</a>` : m.es_recurrente && m.fecha_pago ? '<a class="badge bg-success text-decoration-none" href="pagos.html#ingresos">Movimiento confirmado · Ver ingreso programado</a>'  : tienePlantilla ? `
                        <span class="text-muted small d-inline-flex align-items-center" style="font-size: 0.68rem; cursor: help; background-color: #f1f5f9; padding: 2px 8px; border-radius: 12px; font-weight: 600;" title="Movimiento confirmado de origen programado. Adminístralo desde Pagos programados.">
                            <i class="fas fa-sync-alt text-primary fa-spin-hover me-1" style="font-size: 0.72rem;"></i> Realizado de origen programado
                        </span>
                    ` : `
                        ${m.es_recurrente ? '<span class="badge bg-secondary me-2" title="Registro histórico de origen programado; el compromiso ya no está activo.">Histórico de origen programado</span>' : ''}
                        <button class="btn btn-sm btn-link text-primary p-0 me-2" onclick="prepararEdicion(${m.id})" title="Editar">
                            <i class="fas fa-edit" style="font-size: 0.9rem;"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarMovimiento(${m.id})" title="Eliminar">
                            <i class="fas fa-trash" style="font-size: 0.9rem;"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// --- CONTROL DEL MODAL DE CREACIÓN/EDICIÓN ---
function abrirModalCrear() {
    document.getElementById('reg-id').value = '';
    document.getElementById('form-movimiento').reset();
    
    // Textos del modal
    document.getElementById('modalMovimientoLabel').innerHTML = '<i class="fas fa-plus-circle me-2 text-primary"></i>Registrar ingreso o gasto';
    document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-save me-1"></i>Guardar operación';
    
    // Categorías por defecto
    llenarSelectCategorias(document.getElementById('filtro-categoria').value);
    
    // Fecha hoy por defecto
    document.getElementById('reg-fecha').value = fechaLima();

    modalMovimientoObj.show();
}

// --- FETCH: CRUD Movimientos (Guardar) ---
async function agregarOEditarMovimiento(e) {
    e.preventDefault();
    if(guardandoMovimiento)return;
    const id = document.getElementById('reg-id').value;
    const tipo = document.getElementById('reg-tipo').value;
    const categoria_id = document.getElementById('reg-categoria').value;
    const descripcion = document.getElementById('reg-desc').value.trim();
    const monto = parseFloat(document.getElementById('reg-monto').value);
    const fecha = document.getElementById('reg-fecha').value;

    if(fecha>fechaLima()){Swal.fire('Fecha futura','Usa Pagos programados para compromisos que aún no realizaste.','warning');return;}
    if (!Number.isFinite(monto) || monto <= 0) {
        Swal.fire('Monto inválido', 'Ingresa un monto mayor que S/. 0.00.', 'warning');
        return;
    }

    guardandoMovimiento=true;document.getElementById('btn-submit-form').disabled=true;
    try {
        const response = await fetch('gestion_movimientos.php?action=guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, tipo, categoria_id, descripcion, monto, fecha })
        });
        const res = await response.json();
        if(res.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Registro guardado', showConfirmButton: false, timer: 2000 });
            modalMovimientoObj.hide();
            cargarDatosDesdeBD();
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Fallo al guardar el movimiento.', 'error');
    } finally {guardandoMovimiento=false;document.getElementById('btn-submit-form').disabled=false;}
}

function prepararEdicion(id) {
    const mov = AppState.movimientos.find(m => m.id == id);
    if(!mov) return;

    document.getElementById('reg-id').value = mov.id;
    document.getElementById('reg-tipo').value = mov.tipo;
    document.getElementById('reg-categoria').value = mov.categoria_id !== null ? String(mov.categoria_id) : '';
    document.getElementById('reg-desc').value = mov.descripcion;
    document.getElementById('reg-monto').value = mov.monto;
    document.getElementById('reg-fecha').value = mov.fecha;

    // Cambiar textos dinámicos del modal
    document.getElementById('modalMovimientoLabel').innerHTML = '<i class="fas fa-edit me-2 text-warning"></i>Editar Movimiento';
    document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-save me-1"></i>Actualizar Cambios';
    
    modalMovimientoObj.show();
}

function cancelarEdicion() {
    modalMovimientoObj.hide();
}

// --- FETCH: Eliminar un Movimiento ---
function eliminarMovimiento(id) {
    Swal.fire({
        title: '¿Estás seguro?',
        text: "Se eliminará este movimiento de la base de datos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=eliminar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const res = await response.json();
                if(res.success) {
                    Swal.fire('Eliminado', 'El movimiento fue eliminado.', 'success');
                    cargarDatosDesdeBD();
                } else {Swal.fire('No se pudo eliminar',res.error||'Revisa el movimiento.','error');}
            } catch (error) {
                Swal.fire('Error', 'No se pudo eliminar.', 'error');
            }
        }
    });
}

// --- FETCH: Vaciar todos los movimientos manuales ---
function borrarTodosLosMovimientos() {
    const movimientosManuales = AppState.movimientos.filter(m => !esOrigenProgramado(m));
    if(movimientosManuales.length === 0) {
        Swal.fire('Sin registros manuales', 'No hay registros manuales para eliminar. Los pagos de cronogramas se administran por separado.', 'info');
        return;
    }

    Swal.fire({
        title: '¿Borrar movimientos manuales?',
        text: `Se eliminarán permanentemente ${movimientosManuales.length} movimiento${movimientosManuales.length === 1 ? '' : 's'} manual${movimientosManuales.length === 1 ? '' : 'es'}. La eliminación abarca todos los meses, independientemente de los filtros. Los pagos de cronogramas se conservarán.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Sí, borrar manuales',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=borrar_todo', { method: 'POST' });
                const res = await response.json();
                if(res.success) {
                    Swal.fire('¡Vaciado!', 'Todos los movimientos manuales han sido eliminados.', 'success');
                    cancelarEdicion();
                    cargarDatosDesdeBD();
                }
            } catch (error) {
                Swal.fire('Error', 'No se pudieron eliminar los registros manuales.', 'error');
            }
        }
    });
}
