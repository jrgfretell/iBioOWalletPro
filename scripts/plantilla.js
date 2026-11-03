let AppState = {
    montoBase: 0,
    sueldosPorMes: {},
    categorias: [],
    recurrentes: [],
    programadosRecurrentes: []
};

const SUELDO_15_DEF = 0;
const SUELDO_30_DEF = 0;
const NOMBRES_MESES_COMPLETOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const NOMBRES_MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

let modalRecurrenteObj;
let ultimaVersionDatos = null;
let modalidadSueldoActual = 'quincenal';

function formatearSoles(valor) {
    const num = Number(valor) || 0;
    return 'S/. ' + num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

document.addEventListener("DOMContentLoaded", () => {
    modalRecurrenteObj = new bootstrap.Modal(document.getElementById('modal-recurrente'));
    
    const hoy = new Date();
    const anioInicio = hoy.getFullYear();

    // Llenar dinámicamente sueldo-anio
    const selectSueldoAnio = document.getElementById('sueldo-anio');
    if (selectSueldoAnio) {
        selectSueldoAnio.innerHTML = '';
        for (let i = -1; i < 3; i++) {
            const anioVal = anioInicio + i;
            const opt = document.createElement('option');
            opt.value = anioVal;
            opt.innerText = anioVal;
            selectSueldoAnio.appendChild(opt);
        }
    }

    document.getElementById('sueldo-mes').value = hoy.getMonth();
    document.getElementById('sueldo-anio').value = hoy.getFullYear();
    
    generarSelectorPeriodos();
    cargarDatosDesdeBD();

    // Sincronizar automáticamente en tiempo real al enfocar la pestaña
    window.addEventListener('focus', () => {
        cargarDatosDesdeBD({ preservarVista: true });
    });
});

// --- DINÁMICO: Selector de meses de aplicación ---
function generarSelectorPeriodos() {
    const container = document.getElementById('selector-periodos');
    container.innerHTML = '';

    const fechaActual = new Date();
    let añoActual = fechaActual.getFullYear();
    let mesActual = fechaActual.getMonth(); 

    // Proyectar dinámicamente 12 meses a futuro a partir de hoy
    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() + 12);
    const añoLimite = fechaLimite.getFullYear();
    const mesLimite = fechaLimite.getMonth();

    while (añoActual < añoLimite || (añoActual === añoLimite && mesActual <= mesLimite)) {
        const valor = `${añoActual}-${mesActual}`;
        const texto = `${NOMBRES_MESES_CORTOS[mesActual]} ${añoActual}`;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'chk-periodo d-none';
        input.value = valor;
        input.id = `chk-${valor}`;

        const label = document.createElement('label');
        label.className = 'month-chip';
        label.setAttribute('for', `chk-${valor}`);
        label.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 0.7rem; font-weight: 600; color: #555; background: #ffffff; cursor: pointer; transition: all 0.15s ease-in-out; user-select: none; margin: 2px;';
        label.innerHTML = `<i class="fas fa-plus opacity-50" style="font-size:0.6rem;"></i> ${texto}`;

        input.addEventListener('change', () => {
            if (input.checked) {
                label.style.backgroundColor = '#1abc9c';
                label.style.borderColor = '#1abc9c';
                label.style.color = '#ffffff';
                label.innerHTML = `<i class="fas fa-check" style="font-size:0.6rem;"></i> ${texto}`;
            } else {
                label.style.backgroundColor = '#ffffff';
                label.style.borderColor = '#e2e8f0';
                label.style.color = '#555';
                label.innerHTML = `<i class="fas fa-plus opacity-50" style="font-size:0.6rem;"></i> ${texto}`;
            }
        });

        container.appendChild(input);
        container.appendChild(label);

        mesActual++;
        if (mesActual > 11) {
            mesActual = 0;
            añoActual++;
        }
    }
}

function togglePeriodosSelector() {
    const esEspecifico = document.getElementById('periodo-especificos').checked;
    const selector = document.getElementById('selector-periodos');
    if (esEspecifico) {
        selector.classList.remove('d-none');
    } else {
        selector.classList.add('d-none');
        document.querySelectorAll('.chk-periodo').forEach(c => c.checked = false);
    }
}

function formatearPeriodosLegibles(periodosStr) {
    if (!periodosStr) return '<span class="text-success small fw-semibold"><i class="fas fa-check-circle me-1"></i>Todos los meses</span>';
    
    const periodos = periodosStr.split(',');
    const legibles = periodos.map(p => {
        const parts = p.split('-');
        if(parts.length < 2) return p;
        const anio = parts[0];
        const mes = parts[1];
        return `${NOMBRES_MESES_CORTOS[parseInt(mes, 10)]} ${anio.substring(2)}`;
    });

    if (legibles.length > 3) {
        return `<span class="text-secondary small" style="cursor:help;" title="${legibles.join(', ')}">${legibles.slice(0, 3).join(', ')}... (+${legibles.length - 3})</span>`;
    }
    return `<span class="text-secondary small">${legibles.join(', ')}</span>`;
}

// --- FETCH: Obtener datos desde backend ---
async function cargarDatosDesdeBD({ preservarVista = false } = {}) {
    const lista = document.getElementById('lista-recurrentes');
    if (lista) lista.setAttribute('aria-busy', 'true');
    try {
        const response = await fetch('obtener_datos.php?t=' + new Date().getTime());
        const res = await response.json();
        if(res.success) {
            const version = JSON.stringify([res.montoBase,res.fechaReferencia, res.sueldosPorMes || {}, res.categorias || [], res.recurrentes || [], res.movimientos || [], res.programadosRecurrentes || []]);
            if (ultimaVersionDatos === version) return;
            const scrollTop = preservarVista && lista ? lista.scrollTop : 0;
            AppState.montoBase = parseFloat(res.montoBase) || 0;
            AppState.fechaReferencia=res.fechaReferencia||null;
            AppState.sueldosPorMes = res.sueldosPorMes || {};
            AppState.categorias = res.categorias || [];
            AppState.recurrentes = res.recurrentes || [];
            AppState.programadosRecurrentes = res.programadosRecurrentes || [];

            const historicos = (res.movimientos || []).filter(m => m.es_recurrente && !AppState.recurrentes.some(r => r.id === m.recurrente_id));
            const aviso = document.getElementById('aviso-historicos');
            if (aviso) {
                aviso.classList.toggle('d-none', historicos.length === 0);
                aviso.textContent = historicos.length > 0
                    ? `Hay ${historicos.length} movimientos de origen fijo sin plantilla activa. Siguen registrados en la agenda y afectan al balance. Puedes revisarlos, editarlos o eliminarlos en Movimientos, seleccionando Todos los meses.`
                    : '';
            }
            
            cargarSueldosMesSeleccionado();
            llenarSelectCategorias();
            renderRecurrentes();
            window.dispatchEvent(new Event('programados-cambio'));
            ultimaVersionDatos = version;
            if (preservarVista && lista) requestAnimationFrame(() => { lista.scrollTop = scrollTop; });
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error de Conexión', 'No se pudo obtener datos del servidor.', 'error');
    } finally {
        if (lista) lista.setAttribute('aria-busy', 'false');
    }
}

// --- GESTIÓN DE PERFIL DE SUELDOS E INGRESOS ---
function cargarSueldosMesSeleccionado() {
    const mes = parseInt(document.getElementById('sueldo-mes').value, 10);
    const anio = parseInt(document.getElementById('sueldo-anio').value, 10);
    const llave = `${anio}-${mes}`;
    const nombreMes = NOMBRES_MESES_COMPLETOS[mes] || 'Mes';

    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    const subFinMes = document.getElementById('sub-modo-fin-mes');
    if (subFinMes) {
        subFinMes.innerText = `Día ${ultimoDia}`;
    }

    let s15 = SUELDO_15_DEF;
    let s30 = SUELDO_30_DEF;

    if (AppState.sueldosPorMes && AppState.sueldosPorMes[llave]) {
        s15 = parseFloat(AppState.sueldosPorMes[llave].s15) || 0;
        s30 = parseFloat(AppState.sueldosPorMes[llave].s30) || 0;
    }

    document.getElementById('inp-sueldo-15').value = s15;
    document.getElementById('inp-sueldo-30').value = s30;

    // Auto-detectar modalidad cuando el mes ya tiene montos guardados
    if (s15 > 0 && s30 > 0) {
        modalidadSueldoActual = 'quincenal';
    } else if (s15 === 0 && s30 > 0) {
        modalidadSueldoActual = 'mensual_30';
    } else if (s15 > 0 && s30 === 0) {
        modalidadSueldoActual = 'mensual_15';
    }

    // Actualizar textos de alcance de aplicación
    const optMes = document.getElementById('opt-alcance-mes');
    const optResto = document.getElementById('opt-alcance-resto');
    const optAnio = document.getElementById('opt-alcance-anio');
    const selectAlcance = document.getElementById('sueldo-alcance');

    if (optMes) optMes.innerText = `Solo en ${nombreMes} ${anio}`;
    if (optResto) {
        if (mes === 11) {
            optResto.innerText = `Desde Diciembre (último mes de ${anio})`;
            optResto.disabled = true;
        } else {
            optResto.innerText = `Desde ${nombreMes} hasta Diciembre ${anio} (${12 - mes} meses)`;
            optResto.disabled = false;
        }
    }
    if (optAnio) optAnio.innerText = `En todo el año ${anio} (Enero a Diciembre)`;
    if (selectAlcance) selectAlcance.value = 'mes';

    aplicarVistaModalidadSueldo(ultimoDia);
    actualizarTotalSueldoEnVivo();
    renderPanoramaAnualSueldos();

    if (typeof renderIngresosProgramadosMes === 'function') {
        renderIngresosProgramadosMes();
    }
}

function aplicarVistaModalidadSueldo(ultimoDiaParam) {
    const mes = parseInt(document.getElementById('sueldo-mes').value, 10);
    const anio = parseInt(document.getElementById('sueldo-anio').value, 10);
    const ultimoDia = ultimoDiaParam || new Date(anio, mes + 1, 0).getDate();

    document.querySelectorAll('[data-income-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.incomeMode === modalidadSueldoActual);
    });

    const grupo15 = document.getElementById('grupo-sueldo-15');
    const grupo30 = document.getElementById('grupo-sueldo-30');
    const lbl15 = document.getElementById('lbl-sueldo-15');
    const lbl30 = document.getElementById('lbl-sueldo-fin-mes');
    const repartirBox = document.getElementById('herramienta-repartir-50');

    if (modalidadSueldoActual === 'quincenal') {
        if (grupo15) grupo15.classList.remove('d-none');
        if (grupo30) grupo30.classList.remove('d-none');
        if (repartirBox) repartirBox.classList.remove('d-none');
        if (lbl15) lbl15.innerText = 'Sueldo Quincena (Día 15)';
        if (lbl30) lbl30.innerText = `Sueldo Fin de Mes (Día ${ultimoDia})`;
    } else if (modalidadSueldoActual === 'mensual_30') {
        if (grupo15) grupo15.classList.add('d-none');
        if (grupo30) grupo30.classList.remove('d-none');
        if (repartirBox) repartirBox.classList.add('d-none');
        if (lbl30) lbl30.innerText = `Sueldo Mensual Fin de Mes (Día ${ultimoDia})`;
    } else if (modalidadSueldoActual === 'mensual_15') {
        if (grupo15) grupo15.classList.remove('d-none');
        if (grupo30) grupo30.classList.add('d-none');
        if (repartirBox) repartirBox.classList.add('d-none');
        if (lbl15) lbl15.innerText = 'Sueldo Mensual (Día 15)';
    }
}

function cambiarModalidadSueldo(nuevoModo) {
    const inp15 = document.getElementById('inp-sueldo-15');
    const inp30 = document.getElementById('inp-sueldo-30');
    const s15 = parseFloat(inp15.value) || 0;
    const s30 = parseFloat(inp30.value) || 0;
    const totalActual = s15 + s30;

    modalidadSueldoActual = nuevoModo;

    if (nuevoModo === 'mensual_30') {
        inp15.value = 0;
        if (s30 === 0 && totalActual > 0) {
            inp30.value = totalActual;
        }
    } else if (nuevoModo === 'mensual_15') {
        inp30.value = 0;
        if (s15 === 0 && totalActual > 0) {
            inp15.value = totalActual;
        }
    } else if (nuevoModo === 'quincenal') {
        // Si venía de un solo pago mensual con monto, podemos mantenerlo o dividirlo si una de las partes está en 0
        if (totalActual > 0 && (s15 === 0 || s30 === 0)) {
            const mitad = Math.round((totalActual / 2) * 100) / 100;
            inp15.value = mitad;
            inp30.value = Math.round((totalActual - mitad) * 100) / 100;
        }
    }

    aplicarVistaModalidadSueldo();
    actualizarTotalSueldoEnVivo();
}

async function dividirSueldoEnQuincenas() {
    const inp15 = document.getElementById('inp-sueldo-15');
    const inp30 = document.getElementById('inp-sueldo-30');
    const actual = (parseFloat(inp15.value) || 0) + (parseFloat(inp30.value) || 0);

    const { value: montoTotal } = await Swal.fire({
        title: 'Dividir sueldo en 2 quincenas',
        text: 'Ingresa tu sueldo mensual total y lo dividiremos en 50% para el día 15 y 50% para fin de mes.',
        input: 'number',
        inputValue: actual > 0 ? actual : '',
        inputAttributes: { min: '0', step: '0.01', placeholder: 'Ej. 3000' },
        showCancelButton: true,
        confirmButtonText: 'Dividir 50% / 50%',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1abc9c',
        inputValidator: (val) => {
            const num = parseFloat(val);
            if (isNaN(num) || num < 0) return 'Ingresa un monto válido';
        }
    });

    if (montoTotal !== undefined) {
        const total = parseFloat(montoTotal) || 0;
        const mitad = Math.round((total / 2) * 100) / 100;
        inp15.value = mitad;
        inp30.value = Math.round((total - mitad) * 100) / 100;
        actualizarTotalSueldoEnVivo();
    }
}

function actualizarTotalSueldoEnVivo() {
    const mes = parseInt(document.getElementById('sueldo-mes').value, 10);
    const anio = parseInt(document.getElementById('sueldo-anio').value, 10);
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    const nombreMes = NOMBRES_MESES_COMPLETOS[mes] || 'Mes';

    let s15 = parseFloat(document.getElementById('inp-sueldo-15').value) || 0;
    let s30 = parseFloat(document.getElementById('inp-sueldo-30').value) || 0;

    if (modalidadSueldoActual === 'mensual_30') s15 = 0;
    if (modalidadSueldoActual === 'mensual_15') s30 = 0;

    const total = s15 + s30;

    const caja = document.getElementById('caja-total-sueldo-vivo');
    const lblMes = document.getElementById('lbl-resumen-vivo-mes');
    const txtTotal = document.getElementById('txt-total-sueldo-vivo');
    const txtDesglose = document.getElementById('txt-desglose-sueldo-vivo');

    if (caja) caja.classList.toggle('is-zero', total <= 0);
    if (lblMes) lblMes.innerText = `Total Sueldo ${nombreMes} ${anio}:`;
    if (txtTotal) {
        txtTotal.innerText = formatearSoles(total);
        txtTotal.className = total > 0 ? 'fs-5 text-success' : 'fs-5 text-secondary';
    }
    if (txtDesglose) {
        if (modalidadSueldoActual === 'mensual_30') {
            txtDesglose.innerText = `Cobro único a fin de mes (Día ${ultimoDia}): ${formatearSoles(s30)}`;
        } else if (modalidadSueldoActual === 'mensual_15') {
            txtDesglose.innerText = `Cobro único en quincena (Día 15): ${formatearSoles(s15)}`;
        } else {
            txtDesglose.innerText = `Día 15: ${formatearSoles(s15)} · Día ${ultimoDia}: ${formatearSoles(s30)}`;
        }
    }
}

function renderPanoramaAnualSueldos() {
    const mesSeleccionado = parseInt(document.getElementById('sueldo-mes').value, 10);
    const anioSeleccionado = parseInt(document.getElementById('sueldo-anio').value, 10);
    const hoy = new Date();
    const mesHoy = hoy.getMonth();
    const anioHoy = hoy.getFullYear();

    const panoramaAnioTxt = document.getElementById('panorama-anio-txt');
    if (panoramaAnioTxt) panoramaAnioTxt.innerText = anioSeleccionado;

    const grilla = document.getElementById('grilla-sueldos-anual');
    let sumaAnual = 0;
    let mesesConfigurados = 0;

    if (grilla) {
        grilla.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const llave = `${anioSeleccionado}-${m}`;
            const reg = (AppState.sueldosPorMes && AppState.sueldosPorMes[llave]) ? AppState.sueldosPorMes[llave] : { s15: 0, s30: 0 };
            const s15 = parseFloat(reg.s15) || 0;
            const s30 = parseFloat(reg.s30) || 0;
            const totalMes = s15 + s30;
            const ultimoDia = new Date(anioSeleccionado, m + 1, 0).getDate();

            sumaAnual += totalMes;
            if (totalMes > 0) mesesConfigurados++;

            let metaTexto = 'Sin sueldo';
            if (s15 > 0 && s30 > 0) {
                metaTexto = `15 y Día ${ultimoDia}`;
            } else if (s30 > 0) {
                metaTexto = `Fin mes (Día ${ultimoDia})`;
            } else if (s15 > 0) {
                metaTexto = 'Solo Día 15';
            }

            const esActual = (anioSeleccionado === anioHoy && m === mesHoy);
            const esSeleccionado = (m === mesSeleccionado);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `income-month-tile ${esSeleccionado ? 'is-selected' : ''} ${totalMes > 0 ? 'is-configured' : 'is-zero'}`;
            btn.setAttribute('aria-pressed', esSeleccionado ? 'true' : 'false');
            btn.onclick = () => seleccionarMesDesdePanorama(m);
            btn.innerHTML = `
                <div class="income-month-tile-header">
                    <span class="income-month-name">${NOMBRES_MESES_CORTOS[m]}</span>
                    ${esActual ? '<span class="income-month-current-dot">Hoy</span>' : (totalMes > 0 ? '<i class="fas fa-check-circle text-success" style="font-size:0.7rem;"></i>' : '')}
                </div>
                <div class="income-month-amount">${formatearSoles(totalMes)}</div>
                <div class="income-month-meta">${metaTexto}</div>
            `;
            grilla.appendChild(btn);
        }
    }

    // Actualizar KPIs superiores
    const kpiBase = document.getElementById('ingresos-kpi-base');
    if (kpiBase) {kpiBase.innerText = formatearSoles(AppState.montoBase);const title=kpiBase.previousElementSibling;if(title)title.textContent=AppState.fechaReferencia?'Saldo real al '+AppState.fechaReferencia.split('-').reverse().join('/'):'Saldo inicial';}

    const llaveActual = `${anioSeleccionado}-${mesSeleccionado}`;
    const regMesSel = (AppState.sueldosPorMes && AppState.sueldosPorMes[llaveActual]) ? AppState.sueldosPorMes[llaveActual] : { s15: 0, s30: 0 };
    const s15Sel = parseFloat(regMesSel.s15) || 0;
    const s30Sel = parseFloat(regMesSel.s30) || 0;
    const totalSel = s15Sel + s30Sel;
    const ultimoDiaSel = new Date(anioSeleccionado, mesSeleccionado + 1, 0).getDate();

    const kpiMesLabel = document.getElementById('ingresos-kpi-mes-label');
    const kpiSueldoMes = document.getElementById('ingresos-kpi-sueldo-mes');
    const kpiModalidad = document.getElementById('ingresos-kpi-modalidad');

    if (kpiMesLabel) kpiMesLabel.innerText = `Sueldo ${NOMBRES_MESES_CORTOS[mesSeleccionado]} ${anioSeleccionado}`;
    if (kpiSueldoMes) kpiSueldoMes.innerText = formatearSoles(totalSel);
    if (kpiModalidad) {
        if (s15Sel > 0 && s30Sel > 0) {
            kpiModalidad.className = 'badge bg-success-subtle text-success border border-success-subtle';
            kpiModalidad.innerText = `Quincenal (15 y ${ultimoDiaSel})`;
        } else if (s30Sel > 0) {
            kpiModalidad.className = 'badge bg-primary-subtle text-primary border border-primary-subtle';
            kpiModalidad.innerText = `Mensual (Día ${ultimoDiaSel})`;
        } else if (s15Sel > 0) {
            kpiModalidad.className = 'badge bg-info-subtle text-info-emphasis border border-info-subtle';
            kpiModalidad.innerText = 'Mensual (Día 15)';
        } else {
            kpiModalidad.className = 'badge bg-light text-secondary border';
            kpiModalidad.innerText = 'Sin configurar';
        }
    }

    const kpiAnioLabel = document.getElementById('ingresos-kpi-anio-label');
    const kpiAnual = document.getElementById('ingresos-kpi-anual');
    const kpiMesesActivos = document.getElementById('ingresos-kpi-meses-activos');

    if (kpiAnioLabel) kpiAnioLabel.innerText = `Sueldos ${anioSeleccionado}`;
    if (kpiAnual) kpiAnual.innerText = formatearSoles(sumaAnual);
    if (kpiMesesActivos) kpiMesesActivos.innerText = `${mesesConfigurados} de 12 meses con sueldo`;
}

function seleccionarMesDesdePanorama(mesIdx) {
    const selectMes = document.getElementById('sueldo-mes');
    if (!selectMes) return;
    selectMes.value = mesIdx;
    cargarSueldosMesSeleccionado();

    if (window.innerWidth < 992) {
        const cardForm = selectMes.closest('.card-custom');
        if (cardForm) cardForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function irAMesActualSueldo() {
    const hoy = new Date();
    const selectMes = document.getElementById('sueldo-mes');
    const selectAnio = document.getElementById('sueldo-anio');
    if (selectAnio) {
        const anioHoy = String(hoy.getFullYear());
        if (!Array.from(selectAnio.options).some(o => o.value === anioHoy)) {
            const opt = document.createElement('option');
            opt.value = anioHoy;
            opt.innerText = anioHoy;
            selectAnio.appendChild(opt);
        }
        selectAnio.value = anioHoy;
    }
    if (selectMes) selectMes.value = hoy.getMonth();
    cargarSueldosMesSeleccionado();
}

function editarMontoBasePerfil() {
    Swal.fire({
        title: 'Actualizar saldo real',
        html: `
            <p class="text-muted small mb-2">Este saldo incluye los movimientos ya registrados hasta la fecha indicada. Se aplicarán los posteriores y los compromisos pendientes.</p>
            <div class="input-group">
                <span class="input-group-text">S/.</span>
                <input id="swal-perfil-monto-base" type="number" step="0.01" min="0" class="form-control" value="${Number(AppState.montoBase || 0).toFixed(2)}">
            </div>
            <label for="swal-perfil-fecha" class="form-label mt-3">Fecha del saldo real</label><input id="swal-perfil-fecha" class="form-control" type="date" min="1900-01-01" max="${localDate()}" value="${localDate()}">
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar saldo',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1abc9c',
        didOpen: () => {
            const inp = document.getElementById('swal-perfil-monto-base');
            if (inp) { inp.focus(); inp.select(); }
        },
        preConfirm: () => {
            const val = document.getElementById('swal-perfil-monto-base').value.trim();
            const monto = Number(val);
            if (val === '' || !Number.isFinite(monto) || monto < 0) {
                Swal.showValidationMessage('Ingresa un monto válido igual o mayor a S/. 0.00');
                return false;
            }
            const fecha=document.getElementById('swal-perfil-fecha').value;if(!fecha){Swal.showValidationMessage('Indica la fecha del saldo.');return false;}
            return {monto_base:monto,fecha_referencia:fecha};
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=ajustar_base', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                });
                const res = await response.json();
                if (res.success) {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Saldo base actualizado', showConfirmButton: false, timer: 2000 });
                    cargarDatosDesdeBD({ preservarVista: true });
                } else {
                    Swal.fire('Error', res.error || 'No se pudo actualizar el saldo base', 'error');
                }
            } catch (error) {
                Swal.fire('Error', 'No se pudo guardar el saldo base.', 'error');
            }
        }
    });
}

// --- FETCH: Guardar Configuración de Sueldos ---
async function guardarConfigSueldos() {
    const mes = parseInt(document.getElementById('sueldo-mes').value, 10);
    const anio = parseInt(document.getElementById('sueldo-anio').value, 10);
    let s15 = parseFloat(document.getElementById('inp-sueldo-15').value) || 0;
    let s30 = parseFloat(document.getElementById('inp-sueldo-30').value) || 0;

    if (modalidadSueldoActual === 'mensual_30') s15 = 0;
    if (modalidadSueldoActual === 'mensual_15') s30 = 0;

    if (isNaN(s15) || isNaN(s30) || s15 < 0 || s30 < 0) {
        Swal.fire('Error', 'Los valores de sueldo no son válidos', 'error');
        return;
    }

    const selectAlcance = document.getElementById('sueldo-alcance');
    const alcance = selectAlcance ? selectAlcance.value : 'mes';

    let meses = [mes];
    if (alcance === 'resto') {
        meses = [];
        for (let m = mes; m <= 11; m++) meses.push(m);
    } else if (alcance === 'anio') {
        meses = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }

    try {
        const response = await fetch('guardar_sueldos.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ anio, mes, meses, s15, s30 })
        });
        const res = await response.json();
        if(res.success) {
            const msg = meses.length > 1
                ? `Se aplicó el sueldo en ${meses.length} meses de ${anio}.`
                : `Sueldo de ${NOMBRES_MESES_COMPLETOS[mes]} ${anio} guardado.`;
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: msg, showConfirmButton: false, timer: 2400 });
            await cargarDatosDesdeBD({ preservarVista: true });
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Problema al guardar sueldos.', 'error');
    }
}

// --- LLENAR CATEGORIAS SELECT ---
function llenarSelectCategorias() {
    const select = document.getElementById('rec-categoria');
    select.innerHTML = '';

    if (AppState.categorias.length === 0) {
        select.innerHTML = '<option value="">Crea primero una categoría</option>';
        return;
    }

    AppState.categorias.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.nombre;
        if(cat.nombre.toLowerCase() === 'otros') {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function renderRecurrentes() {
    const listContainer = document.getElementById('lista-recurrentes');
    listContainer.innerHTML = '';

    const totalSpan = document.getElementById('txt-total-recurrentes');
    if (totalSpan) totalSpan.innerText = AppState.recurrentes.length;

    if(AppState.recurrentes.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-muted py-4 small">No hay compromisos recurrentes. Usa Nuevo pago programado para comenzar.</div>`;
        return;
    }

    const diasSemana = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    AppState.recurrentes.forEach(rec => {
        const badgeClassMovil = rec.tipo === 'ingreso' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const signo = rec.tipo === 'ingreso' ? '+' : '-';

        const catColor = rec.categoria_color || '#7f8c8d';
        const catIcono = rec.categoria_icono || 'fa-folder';

        const frecuenciaTexto = rec.tipo_recurrencia === 'semanal' 
            ? `Cada ${diasSemana[rec.dia_pago] || ''}` 
            : `Día ${rec.dia_pago}`;

        const card = document.createElement('div');
        card.className = 'p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center bg-white border-start border-4 movement-card';
        card.style.cssText = `border-left-color: ${catColor} !important; border-radius: 8px;`;
        card.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; background-color: ${catColor}15; border-radius: 50%; color: ${catColor}; font-size: 1.1rem; flex-shrink: 0;">
                    <i class="fas ${catIcono}"></i>
                </div>
                <div>
                    <div class="fw-bold text-dark" style="font-size: 0.9rem; line-height: 1.2;">${esc(rec.descripcion)}</div>
                    <div class="text-muted small" style="font-size: 0.72rem; margin-top: 2px;">
                        ${frecuenciaTexto} • <span class="badge ${badgeClassMovil} p-1" style="font-size: 0.58rem; font-weight: 700; text-transform: uppercase;">${rec.tipo}</span>
                        <div class="mt-1" style="font-size: 0.68rem; font-weight: 500;">${formatearPeriodosLegibles(rec.periodos)}</div>
                    </div>
                </div>
            </div>
            <div class="text-end">
                <div class="fw-bold ${rec.tipo === 'ingreso' ? 'text-success' : 'text-danger'}" style="font-size: 0.95rem;">
                    ${signo} S/. ${rec.monto.toFixed(2)}
                </div>
                <div class="mt-1">
                    <button class="btn btn-sm btn-link text-primary p-0 me-2" onclick="prepararEdicion(${rec.id})" title="Editar">
                        <i class="fas fa-edit" style="font-size: 0.9rem;"></i>
                    </button>
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarRecurrente(${rec.id})" title="Eliminar">
                        <i class="fas fa-trash-alt" style="font-size: 0.9rem;"></i>
                    </button>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// --- CONTROL DEL MODAL DE CREACIÓN/EDICIÓN ---
function abrirModalCrear(tipoPreseleccionado = 'gasto') {
    document.getElementById('rec-id').value = '';
    document.getElementById('form-recurrente').reset();
    document.getElementById('rec-tipo').value = tipoPreseleccionado === 'ingreso' ? 'ingreso' : 'gasto';
    
    // Textos del modal
    if (tipoPreseleccionado === 'ingreso') {
        document.getElementById('modalRecurrenteLabel').innerHTML = '<i class="fas fa-hand-holding-usd me-2 text-success"></i>Nuevo ingreso recurrente';
        document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-plus me-1"></i>Guardar ingreso';
    } else {
        document.getElementById('modalRecurrenteLabel').innerHTML = '<i class="fas fa-plus-circle me-2 text-primary"></i>Nuevo compromiso recurrente';
        document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-plus me-1"></i>Guardar recurrente';
    }
    
    // Frecuencia mensual por defecto
    document.getElementById('frecuencia-mensual').checked = true;
    toggleFrecuenciaSelector();

    // Forzar volver a seleccionar todos los meses y esconder la grilla
    document.getElementById('periodo-todos').checked = true;
    togglePeriodosSelector();

    // Desmarcar visualmente todos los chips
    document.querySelectorAll('.chk-periodo').forEach(chk => {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
    });
    
    llenarSelectCategorias();

    modalRecurrenteObj.show();
}

// --- FETCH: GUARDAR MOVIMIENTO RECURRENTE ---
async function agregarOEditarRecurrente(e) {
    e.preventDefault();
    const id = document.getElementById('rec-id').value;
    const tipo = document.getElementById('rec-tipo').value;
    const dia_pago = parseInt(document.getElementById('rec-dia').value);
    const categoria_id = document.getElementById('rec-categoria').value;
    const descripcion = document.getElementById('rec-desc').value.trim();
    const monto = parseFloat(document.getElementById('rec-monto').value);
    const tipo_recurrencia = document.querySelector('input[name="rec-tipo-frecuencia"]:checked').value;

    // Leer periodos seleccionados si corresponde
    let periodos = null;
    if (document.getElementById('periodo-especificos').checked) {
        const chks = document.querySelectorAll('.chk-periodo:checked');
        const valores = Array.from(chks).map(c => c.value);
        if (valores.length === 0) {
            Swal.fire('Atención', 'Si eliges meses específicos, debes seleccionar al menos un mes.', 'warning');
            return;
        }
        periodos = valores.join(',');
    }

    try {
        const response = await fetch('gestion_movimientos.php?action=guardar_recurrente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, tipo, dia_pago, categoria_id, descripcion, monto, periodos, tipo_recurrencia })
        });
        const res = await response.json();
        if(res.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Plantilla guardada', showConfirmButton: false, timer: 2000 });
            modalRecurrenteObj.hide();
            cargarDatosDesdeBD();
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Fallo al guardar en la plantilla.', 'error');
    }
}

// --- FETCH: ELIMINAR MOVIMIENTO RECURRENTE ---
function eliminarRecurrente(id) {
    Swal.fire({
        title: '¿Eliminar de la plantilla?',
        text: "Se quitará el compromiso y sus pendientes del mes actual y futuros. Los pagos confirmados y los meses anteriores se conservan.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=eliminar_recurrente', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const res = await response.json();
                if(res.success) {
                    Swal.fire('Eliminado', 'Se quitó de la plantilla.', 'success');
                    cargarDatosDesdeBD();
                }
            } catch (error) {
                Swal.fire('Error', 'No se pudo eliminar de la plantilla.', 'error');
            }
        }
    });
}

// --- FETCH: VACIAR PLANTILLA ---
function borrarTodosLosRecurrentes() {
    if(AppState.recurrentes.length === 0) {
        Swal.fire('Plantilla vacía', 'No hay movimientos fijos para borrar.', 'info');
        return;
    }

    Swal.fire({
        title: '¿Borrar TODA la Plantilla?',
        text: `Se eliminarán ${AppState.recurrentes.length} compromisos y sus pendientes del mes actual y futuros. Los pagos confirmados y los meses anteriores se conservan.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, borrar todo',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=borrar_todo_recurrentes', { method: 'POST' });
                const res = await response.json();
                if(res.success) {
                    Swal.fire('¡Vaciado!', 'Toda la plantilla ha sido eliminada.', 'success');
                    cargarDatosDesdeBD();
                }
            } catch (error) {
                Swal.fire('Error', 'Error al vaciar la plantilla.', 'error');
            }
        }
    });
}

// --- EDICIÓN DE MOVIMIENTOS FIJOS ---
function prepararEdicion(id) {
    const rec = AppState.recurrentes.find(r => r.id === id);
    if (!rec) return;

    document.getElementById('rec-id').value = rec.id;
    document.getElementById('rec-tipo').value = rec.tipo;
    
    // Cargar tipo de frecuencia
    const freq = rec.tipo_recurrencia || 'mensual';
    document.getElementById('frecuencia-' + freq).checked = true;
    toggleFrecuenciaSelector();

    document.getElementById('rec-dia').value = rec.dia_pago;
    document.getElementById('rec-categoria').value = rec.categoria_id || '';
    document.getElementById('rec-desc').value = rec.descripcion;
    document.getElementById('rec-monto').value = rec.monto;

    // Cargar períodos de aplicación
    if (rec.periodos) {
        document.getElementById('periodo-especificos').checked = true;
        togglePeriodosSelector();

        const periodosList = rec.periodos.split(',');
        document.querySelectorAll('.chk-periodo').forEach(chk => {
            chk.checked = periodosList.includes(chk.value);
            chk.dispatchEvent(new Event('change'));
        });
    } else {
        document.getElementById('periodo-todos').checked = true;
        togglePeriodosSelector();
        document.querySelectorAll('.chk-periodo').forEach(chk => {
            chk.checked = false;
            chk.dispatchEvent(new Event('change'));
        });
    }

    // Cambiar estados visuales del modal
    document.getElementById('modalRecurrenteLabel').innerHTML = '<i class="fas fa-edit me-2 text-warning"></i>Editar Movimiento Fijo';
    document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-save me-1"></i>Actualizar Fijo';

    modalRecurrenteObj.show();
}

function cancelarEdicion() {
    modalRecurrenteObj.hide();
}

function toggleFrecuenciaSelector() {
    const modo = document.querySelector('input[name="rec-tipo-frecuencia"]:checked').value;
    const selectDia = document.getElementById('rec-dia');
    const labelDia = document.getElementById('label-dia-pago');
    
    if (modo === 'semanal') {
        labelDia.innerText = "Día de la Semana";
        selectDia.innerHTML = `
            <option value="1">Lunes</option>
            <option value="2">Martes</option>
            <option value="3">Miércoles</option>
            <option value="4">Jueves</option>
            <option value="5">Viernes</option>
            <option value="6" selected>Sábado</option>
            <option value="7">Domingo</option>
        `;
    } else {
        labelDia.innerText = "Día de Pago";
        let options = "";
        for (let i = 1; i <= 31; i++) {
            options += `<option value="${i}" ${i === 15 ? 'selected' : ''}>${i}</option>`;
        }
        selectDia.innerHTML = options;
    }
}
