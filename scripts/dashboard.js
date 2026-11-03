Chart.defaults.font.family = "Poppins, sans-serif";

let AppState = {
    montoBase: 0,
    fechaReferencia: null,
    movimientosIncluidos: [],
    sueldosPorMes: {}, 
    categorias: [],
    movimientos: [],
    recurrentes: [],
    proyeccionesCuotas: [],
    cuotasPendientes: []
};

const SUELDO_15_DEF = 0;
const SUELDO_30_DEF = 0;

let chartGastosInstance = null;
let chartProyeccionInstance = null;
let chartFlujoInstance = null;
let ultimaVersionDatos = null;
let actualizacionEnCurso = false;
let mostrarHistorico = localStorage.getItem('wallet_mostrar_historico') === 'true';


// --- ALGORITMO DE PROYECCIÓN ACUMULATIVA MENSUAL CON ARRASTRE HISTÓRICO ---
function toggleMostrarHistorico() {
    mostrarHistorico = !mostrarHistorico;
    localStorage.setItem('wallet_mostrar_historico', mostrarHistorico);
    calcularYRenderizarProyecciones();
}

document.addEventListener("DOMContentLoaded", () => {
    const hoy = new Date();
    
    // Llenar dinámicamente los años (año actual y los 2 siguientes)
    const selectAnio = document.getElementById('grafico-anio');
    if (selectAnio) {
        selectAnio.innerHTML = '';
        const anioInicio = hoy.getFullYear();
        for (let i = 0; i < 3; i++) {
            const opt = document.createElement('option');
            opt.value = anioInicio + i;
            opt.innerText = anioInicio + i;
            selectAnio.appendChild(opt);
        }
    }

    document.getElementById('grafico-mes').value = hoy.getMonth();
    document.getElementById('grafico-anio').value = hoy.getFullYear();
    
    cargarDatosDesdeBD();

    // Sincronizar automáticamente al volver a enfocar la pestaña del Dashboard
    window.addEventListener('focus', () => {
        cargarDatosDesdeBD({ preservarVista: true, notificar: true });
    });
});

// --- FETCH: Obtener todo desde MySQL ---
function obtenerVersionDatos(res) {
    return JSON.stringify({
        montoBase: res.montoBase,
        fechaReferencia: res.fechaReferencia,
        movimientosIncluidos: res.movimientosIncluidos || [],
        sueldosPorMes: res.sueldosPorMes || {},
        categorias: res.categorias || [],
        movimientos: res.movimientos || [],
        recurrentes: res.recurrentes || [],
        proyeccionesCuotas: res.proyeccionesCuotas || [],
        proyeccionesRecurrentes: res.proyeccionesRecurrentes || [],
        cuotasPendientes: res.cuotasPendientes || []
    });
}

function capturarVistaProyecciones() {
    return {
        scrollY: window.scrollY,
        detallesAbiertos: Array.from(document.querySelectorAll('.projection-detail.show')).map(detalle => detalle.id)
    };
}

function restaurarVistaProyecciones(vista) {
    if (!vista) return;

    requestAnimationFrame(() => {
        vista.detallesAbiertos.forEach(id => {
            const detalle = document.getElementById(id);
            if (detalle) bootstrap.Collapse.getOrCreateInstance(detalle, { toggle: false }).show();
        });

        window.setTimeout(() => window.scrollTo({ top: vista.scrollY, behavior: 'auto' }), 360);
    });
}

function mostrarActualizacionDiscreta() {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Datos actualizados',
        showConfirmButton: false,
        timer: 1800,
        timerProgressBar: true
    });
}

async function cargarDatosDesdeBD({ preservarVista = false, notificar = false } = {}) {
    if (actualizacionEnCurso) return;
    actualizacionEnCurso = true;
    try {
        const response = await fetch('obtener_datos.php?t=' + new Date().getTime());
        const res = await response.json();
        if(res.success) {
            const nuevaVersion = obtenerVersionDatos(res);
            const habiaVersionAnterior = ultimaVersionDatos !== null;
            if (ultimaVersionDatos === nuevaVersion) return;

            const vistaAnterior = preservarVista ? capturarVistaProyecciones() : null;
            AppState.montoBase = res.montoBase;
            AppState.fechaReferencia = res.fechaReferencia || null;
            AppState.movimientosIncluidos = res.movimientosIncluidos || [];
            AppState.sueldosPorMes = res.sueldosPorMes || {};
            AppState.categorias = res.categorias || [];
            AppState.movimientos = res.movimientos || [];
            AppState.proyeccionesRecurrentes = res.proyeccionesRecurrentes || [];
            AppState.recurrentes = res.recurrentes || [];
            AppState.proyeccionesCuotas = res.proyeccionesCuotas || [];
            AppState.cuotasPendientes = res.cuotasPendientes || [];
            AppState.recurrentesPendientes = (res.programadosRecurrentes || []).filter(m=>m.tipo==='gasto'&&!Number(m.pago_confirmado));
            
            renderTodo();
            ultimaVersionDatos = nuevaVersion;
            restaurarVistaProyecciones(vistaAnterior);
            if (notificar && habiaVersionAnterior) mostrarActualizacionDiscreta();
        } else {
            if (!notificar) Swal.fire('Error de Datos', res.error, 'error');
        }
    } catch (error) {
        console.error(error);
        if (!notificar) Swal.fire('Error de Conexión', 'No se pudo conectar con el servidor PHP.', 'error');
    } finally {
        actualizacionEnCurso = false;
    }
}

function renderTodo() {
    renderProximasCuotas();
    renderBalance();
    actualizarReporteGastos();
    calcularYRenderizarProyecciones();
}

function escaparCuota(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderProximasCuotas() {
    const container = document.getElementById('proximas-cuotas');
    const hoy = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const list = [...AppState.cuotasPendientes, ...(AppState.recurrentesPendientes || []).map(m=>({nombre:m.descripcion,fecha:m.fecha,pendiente:m.monto,estado:m.fecha<hoy?'vencida':'pendiente'}))].sort((a,b)=>a.fecha.localeCompare(b.fecha));
    const total = list.reduce((sum,c) => sum + Math.round(Number(c.pendiente)*100), 0)/100;
    const format = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n);
    const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    container.innerHTML=`<header class="upcoming-heading"><div class="upcoming-heading-title"><span class="upcoming-icon"><i class="far fa-calendar-check" aria-hidden="true"></i></span><div><h2>Próximos pagos</h2><p>${list.length?'Tus siguientes '+Math.min(4,list.length)+' vencimientos':'Todo al día'}</p></div></div><a class="upcoming-agenda" href="pagos.html#agenda">Agenda <i class="fas fa-arrow-right" aria-hidden="true"></i></a></header>`+
        (list.length?`<div class="upcoming-list">${list.slice(0,4).map(c=>{const [anio,mes,dia]=c.fecha.split('-');const etiqueta=c.deuda_id?(c.modalidad&&c.modalidad!=='cuotas'?'Pago '+c.numero:'Cuota '+c.numero+'/'+c.total_cuotas):'Recurrente';return `<a href="pagos.html#${c.deuda_id?'deuda-'+c.deuda_id:'agenda'}" class="upcoming-payment ${c.estado==='vencida'?'is-overdue':''}" aria-label="${escaparCuota(c.nombre)}, ${format(c.pendiente)}, vence ${dia}/${mes}/${anio}"><time class="upcoming-date" datetime="${c.fecha}"><strong>${dia}</strong><span>${meses[Number(mes)-1]}</span></time><span class="upcoming-payment-info"><strong title="${escaparCuota(c.nombre)}">${escaparCuota(c.nombre)}</strong><span>${etiqueta} · ${anio}${c.estado==='vencida'?' · <em>Vencido</em>':c.fecha===hoy?' · Hoy':''}</span></span><span class="upcoming-amount">${format(Number(c.pendiente))}</span><i class="fas fa-chevron-right upcoming-chevron" aria-hidden="true"></i></a>`;}).join('')}</div><details class="upcoming-total"><summary><span>${list.length} vencimientos pendientes en total</span><span class="upcoming-total-hint">Ver resumen <i class="fas fa-chevron-down" aria-hidden="true"></i></span></summary><div><span>Pendiente total programado</span><strong>${format(total)}</strong><p>Incluye todos los vencimientos generados, además de los mostrados arriba. Los vencidos se proyectan para hoy.</p></div></details>`:'<div class="upcoming-empty">No tienes pagos pendientes. <a href="pagos.html#cuotas">Crear un cronograma</a></div>');

}

function renderBalance() {
    const ref=AppState.fechaReferencia;
    document.getElementById('txt-titulo-saldo').textContent=ref?'Saldo real al '+ref.split('-').reverse().join('/'):'Saldo inicial';
    document.getElementById('txt-ayuda-saldo').textContent=ref?'Punto de partida confirmado. La proyección aplica los movimientos posteriores y los compromisos pendientes. El historial anterior sigue disponible en Movimientos.':'Actualiza tu saldo con una fecha para proyectar desde tu dinero real.';

    document.getElementById('txt-balance-actual').innerText = new Intl.NumberFormat('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(AppState.montoBase);
}

// --- FETCH: Ajustar Monto Base ---
function cambiarMontoBase() {
    Swal.fire({
        title: 'Actualizar saldo disponible',
        html: `
            <p class="text-muted small mb-3">Indica el dinero real que tienes en esta fecha, incluyendo los movimientos ya registrados hasta ese momento. El historial anterior se conserva y los compromisos pendientes siguen descontándose.</p>
            <label for="swal-monto-base" class="form-label fw-semibold d-block text-start">Saldo actual</label>
            <div class="input-group">
                <span class="input-group-text">S/.</span>
                <input id="swal-monto-base" class="form-control" type="number" min="0" step="0.01" inputmode="decimal" value="${AppState.montoBase.toFixed(2)}" aria-label="Saldo actual en soles">
            </div>
            <label for="swal-fecha-saldo" class="form-label mt-3 d-block text-start">Fecha del saldo real</label>
            <input id="swal-fecha-saldo" type="date" class="form-control" min="1900-01-01" max="${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}" value="${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}">
        `,
        showCancelButton: true,
        confirmButtonColor: '#1abc9c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        didOpen: () => {
            const input = document.getElementById('swal-monto-base');
            input.focus();
            input.select();
        },
        preConfirm: () => {
            const valor = document.getElementById('swal-monto-base').value.trim();
            const monto = Number(valor);
            if (valor === '' || !Number.isFinite(monto) || monto < 0) {
                Swal.showValidationMessage('Ingresa un monto válido igual o mayor que S/. 0.00.');
                return false;
            }
            const fecha=document.getElementById('swal-fecha-saldo').value;
            if(!fecha){Swal.showValidationMessage('Indica la fecha de referencia.');return false;}
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
                if(res.success) {
                    Swal.fire('¡Actualizado!', 'El saldo se guardó y las proyecciones se recalcularon.', 'success');
                    cargarDatosDesdeBD();
                }
            } catch (error) {
                Swal.fire('Error', 'No se pudo guardar el balance.', 'error');
            }
        }
    });
}

// --- REPORTE DE GASTOS POR CATEGORÍA ---
function actualizarReporteGastos() {
    const mesSel = parseInt(document.getElementById('grafico-mes').value);
    const anioSel = parseInt(document.getElementById('grafico-anio').value);

    // Filtrar movimientos de tipo gasto para el mes y año seleccionados
    const gastosMes = AppState.movimientos.filter(m => {
        const f = new Date(m.fecha + 'T00:00:00');
        return m.tipo === 'gasto' && f.getFullYear() === anioSel && f.getMonth() === mesSel;
    });

    // Agrupar por categoría
    const acumulado = {};
    
    // Inicializar con las categorías que tienen gastos o por defecto
    gastosMes.forEach(g => {
        const catNombre = g.categoria_nombre || 'Otros';
        const catColor = g.categoria_color || '#7f8c8d';
        if (!acumulado[catNombre]) {
            acumulado[catNombre] = {
                monto: 0,
                color: catColor
            };
        }
        acumulado[catNombre].monto += g.monto;
    });

    const labels = Object.keys(acumulado);
    const dataValues = labels.map(l => acumulado[l].monto);
    const backgroundColors = labels.map(l => acumulado[l].color);

    // Calcular Gastos Totales
    const totalGastosMes = dataValues.reduce((a, b) => a + b, 0);
    document.getElementById('chart-total-gastos-valor').innerText = `S/. ${totalGastosMes.toFixed(2)}`;

    // Pintar Leyenda como Píldoras Responsivas
    const leyendaContainer = document.getElementById('chart-leyenda');
    leyendaContainer.innerHTML = '';
    
    if (labels.length === 0) {
        leyendaContainer.innerHTML = '<div class="text-center text-muted py-2 small">No hay gastos registrados en este mes.</div>';
    } else {
        labels.forEach((label, idx) => {
            const chip = document.createElement('div');
            chip.style.cssText = 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 4px 10px; font-size: 0.72rem; font-weight: 600; display: flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);';
            chip.innerHTML = `
                <span class="category-bullet" style="background-color: ${backgroundColors[idx]}; width: 8px; height: 8px; margin: 0; display: inline-block;"></span>
                <span class="text-secondary">${label}:</span>
                <span style="color:#2c3e50; font-weight:700;">S/. ${dataValues[idx].toFixed(2)}</span>
            `;
            leyendaContainer.appendChild(chip);
        });
    }

    // Destruir chart viejo si existe
    if (chartGastosInstance) {
        chartGastosInstance.destroy();
    }

    // Si no hay datos, pintar dona vacía gris
    const finalLabels = labels.length > 0 ? labels : ['Sin Gastos'];
    const finalData = labels.length > 0 ? dataValues : [1];
    const finalColors = labels.length > 0 ? backgroundColors : ['#e2e8f0'];

    const ctx = document.getElementById('chartGastos').getContext('2d');
    chartGastosInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: finalLabels,
            datasets: [{
                data: finalData,
                backgroundColor: finalColors,
                borderWidth: 0,
                borderRadius: labels.length > 0 ? 5 : 0,
                spacing: labels.length > 0 ? 3 : 0,
                cutout: '72%',
                hoverOffset: labels.length > 0 ? 4 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: labels.length > 0, // Desactivar tooltip para dona gris vacía
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: S/. ${context.raw.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

function formatearMoneda(monto) {
    return `S/. ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto)}`;
}

function renderGraficoFlujo(proyecciones) {
    if (chartFlujoInstance) chartFlujoInstance.destroy();

    const ctx = document.getElementById('chartFlujoMensual').getContext('2d');
    chartFlujoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: proyecciones.map(p => p.labelCorto),
            datasets: [
                { label: 'Disponible', data: proyecciones.map(p => p.disponible), backgroundColor: '#2ecc71', borderRadius: 5 },
                { label: 'Gastos', data: proyecciones.map(p => p.gastos), backgroundColor: '#e74c3c', borderRadius: 5 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
                tooltip: { callbacks: { label: context => ` ${context.dataset.label}: ${formatearMoneda(context.raw)}` } }
            },
            scales: {
                x: { stacked: false, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: { ticks: { callback: value => `S/. ${Number(value).toLocaleString('es-PE')}` } }
            }
        }
    });
}

function irAProyeccion(anio, mes) {
    const tarjeta = document.getElementById(`projection-${anio}-${mes}`);
    if (!tarjeta) return;

    const fold=tarjeta.querySelector('details');if(fold)fold.open=true;
    tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tarjeta.focus({ preventScroll: true });
}

function renderResumenFinanciero(proyecciones) {
    if (!proyecciones.length) return;

    // Para los KPIs de mejor mes y menor liquidez, considerar las proyecciones desde el mes actual en adelante
    const proyeccionesFuturas = proyecciones.filter(p => !p.esPasado);
    const conjuntoKPIs = proyeccionesFuturas.length ? proyeccionesFuturas : proyecciones;

    const mejorMes = conjuntoKPIs.reduce((mejor, actual) => actual.balanceFin > mejor.balanceFin ? actual : mejor);
    const mesMenorLiquidez = conjuntoKPIs.reduce((menor, actual) => actual.balanceFin < menor.balanceFin ? actual : menor);
    const mesActual = proyecciones.find(p => !p.esPasado) || proyecciones[0];
    const resumen = document.getElementById('resumen-proyecciones');

    resumen.innerHTML = `
        <div class="col"><div class="projection-kpi"><span class="projection-kpi-label">Mejor mes proyectado</span><strong class="text-success">${mejorMes.label}</strong><span>${formatearMoneda(mejorMes.balanceFin)}</span></div></div>
        <div class="col"><div class="projection-kpi"><span class="projection-kpi-label">Menor liquidez</span><strong class="${mesMenorLiquidez.balanceFin < 0 ? 'text-danger' : 'text-warning'}">${mesMenorLiquidez.label}</strong><span>${formatearMoneda(mesMenorLiquidez.balanceFin)}</span></div></div>
        <div class="col"><div class="projection-kpi"><span class="projection-kpi-label">${AppState.fechaReferencia?'Gastos por aplicar este mes':'Gastos este mes'}</span><strong>${mesActual.label}</strong><span class="text-danger">-${formatearMoneda(mesActual.gastos)}</span></div></div>
    `;

    const alerta = conjuntoKPIs.find(p => p.balanceFin < 0) || conjuntoKPIs.find(p => p.bolsilloAntes15 < 0 || p.balanceTras15 < 0 || p.bolsilloAntesFinMes < 0);
    const alertas = document.getElementById('alertas-proyecciones');
    if (alerta) {
        const esDeficit = alerta.balanceFin < 0;
        let monto = alerta.balanceFin;
        if (!esDeficit) {
            if (alerta.bolsilloAntes15 < 0) monto = alerta.bolsilloAntes15;
            else if (alerta.balanceTras15 < 0) monto = alerta.balanceTras15;
            else if (alerta.bolsilloAntesFinMes < 0) monto = alerta.bolsilloAntesFinMes;
        }
        alertas.innerHTML = `
            <div class="projection-alert ${esDeficit ? 'is-danger' : 'is-warning'}">
                <div><i class="fas ${esDeficit ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'} me-2"></i><strong>${esDeficit ? 'Saldo negativo previsto' : 'Liquidez ajustada'}</strong><span> ${alerta.label}: ${formatearMoneda(monto)}.</span></div>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="irAProyeccion(${alerta.anio}, ${alerta.mes})">Ver mes</button>
            </div>
        `;
    } else {
        alertas.innerHTML = '<div class="projection-alert is-success"><div><i class="fas fa-circle-check me-2"></i><strong>Proyección saludable.</strong><span> Sin saldos negativos en los próximos meses.</span></div></div>';
    }

    const proyeccionesGraficos = mostrarHistorico ? proyecciones : conjuntoKPIs;

    if (chartProyeccionInstance) chartProyeccionInstance.destroy();
    const ctx = document.getElementById('chartProyeccion').getContext('2d');
    chartProyeccionInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: proyeccionesGraficos.map(p => p.labelCorto),
            datasets: [{
                label: 'Saldo estimado',
                data: proyeccionesGraficos.map(p => p.balanceFin),
                borderColor: '#1abc9c',
                backgroundColor: 'rgba(26, 188, 156, 0.14)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: proyeccionesGraficos.map(p => p.balanceFin < 0 ? '#e74c3c' : '#1abc9c')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context => ` Saldo: ${formatearMoneda(context.raw)}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
                y: { ticks: { callback: value => `S/. ${Number(value).toLocaleString('es-PE')}` } }
            }
        }
    });

    renderGraficoFlujo(proyeccionesGraficos);
}

// --- ALGORITMO DE PROYECCIÓN ACUMULATIVA MENSUAL CON ARRASTRE HISTÓRICO ---
function toggleMostrarHistorico() {
    mostrarHistorico = !mostrarHistorico;
    localStorage.setItem('wallet_mostrar_historico', mostrarHistorico);
    calcularYRenderizarProyecciones();
}

function calcularYRenderizarProyecciones() {
    const contenedor = document.getElementById('contenedor-proyecciones');
    contenedor.innerHTML = '';
    detalleMeses.clear();

    const fechaActual = new Date();
    const añoHoy = fechaActual.getFullYear();
    const mesHoy = fechaActual.getMonth(); // 0 a 11

    // Buscar el año/mes más antiguo registrado en movimientos o sueldos por mes
    let añoInicio = añoHoy;
    let mesInicio = mesHoy;

    if (AppState.movimientos && AppState.movimientos.length > 0) {
        AppState.movimientos.forEach(m => {
            if (!m.fecha) return;
            const fMov = new Date(m.fecha + 'T00:00:00');
            const a = fMov.getFullYear();
            const mIdx = fMov.getMonth();
            if (a < añoInicio || (a === añoInicio && mIdx < mesInicio)) {
                añoInicio = a;
                mesInicio = mIdx;
            }
        });
    }

    if (AppState.sueldosPorMes) {
        Object.keys(AppState.sueldosPorMes).forEach(llave => {
            const parts = llave.split('-');
            if (parts.length < 2) return;
            const a = parseInt(parts[0]);
            const mIdx = parseInt(parts[1]);
            if (!isNaN(a) && !isNaN(mIdx)) {
                if (a < añoInicio || (a === añoInicio && mIdx < mesInicio)) {
                    añoInicio = a;
                    mesInicio = mIdx;
                }
            }
        });
    }

    const referencia=AppState.fechaReferencia;
    const incluidos=new Set(AppState.movimientosIncluidos.map(String));
    if(referencia){[añoInicio,mesInicio]=referencia.split('-').slice(0,2).map(Number);mesInicio--;}
    let añoActual = añoInicio;
    let mesActual = mesInicio;

    // Proyectar dinámicamente 12 meses a futuro a partir del mes actual
    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() + 12);
    const añoLimite = fechaLimite.getFullYear();
    const mesLimite = fechaLimite.getMonth();

    let balanceAcumulado = AppState.montoBase;
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const proyecciones = [];

    while (añoActual < añoLimite || (añoActual === añoLimite && mesActual <= mesLimite)) {

        const llaveSueldo = `${añoActual}-${mesActual}`;
        let s15_aplicado = SUELDO_15_DEF;
        let s30_aplicado = SUELDO_30_DEF;

        if (AppState.sueldosPorMes && AppState.sueldosPorMes[llaveSueldo]) {
            s15_aplicado = AppState.sueldosPorMes[llaveSueldo].s15;
            s30_aplicado = AppState.sueldosPorMes[llaveSueldo].s30;
        }

        const ultimoDiaMes = new Date(añoActual, mesActual + 1, 0).getDate();
        const mesReferencia=referencia && referencia.slice(0,7)===`${añoActual}-${String(mesActual+1).padStart(2,'0')}`;
        if(!sueldoPosteriorReferencia(añoActual,mesActual,15,referencia))s15_aplicado=0;
        if(!sueldoPosteriorReferencia(añoActual,mesActual,ultimoDiaMes,referencia))s30_aplicado=0;

        // 1. Separar gastos/ingresos extra (Manuales de la Agenda) por quincena
        let extrasIngresos1a = 0, extrasGastos1a = 0; // Días 1-14
        let extrasIngresos1b = 0, extrasGastos1b = 0; // Día 15
        let extrasIngresos2a = 0, extrasGastos2a = 0; // Días 16 al penúltimo día
        let extrasIngresos2b = 0, extrasGastos2b = 0; // Día final (30/31)
        
        // Para mostrar los nombres con categoría
        const detExtras1a = [];
        const detExtras1b = [];
        const detExtras2a = [];
        const detExtras2b = [];

        const realizados=AppState.movimientos.filter(m=>movimientoPosteriorReferencia(m,referencia,incluidos));
        const pendientes=[...AppState.proyeccionesCuotas,...(AppState.proyeccionesRecurrentes||[])].map(m=>({...m,fecha:referencia&&m.fecha<referencia?referencia:m.fecha}));
        [...realizados, ...pendientes].forEach(m => {
            const fMov = new Date(m.fecha + 'T00:00:00');
            if (fMov.getFullYear() === añoActual && fMov.getMonth() === mesActual) {
                const dia = fMov.getDate();
                const tag = `<span class="category-bullet" style="background-color: ${m.categoria_color || '#7f8c8d'};" title="${m.categoria_nombre || 'Otros'}"></span>`;
                
                if (dia < 15) {
                    if (m.tipo === 'ingreso') {
                        extrasIngresos1a += m.monto;
                        detExtras1a.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-success">+S/. ${m.monto.toFixed(2)}</span></div>`);
                    } else {
                        extrasGastos1a += m.monto;
                        detExtras1a.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-danger">-S/. ${m.monto.toFixed(2)}</span></div>`);
                    }
                } else if (dia === 15) {
                    if (m.tipo === 'ingreso') {
                        extrasIngresos1b += m.monto;
                        detExtras1b.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-success">+S/. ${m.monto.toFixed(2)}</span></div>`);
                    } else {
                        extrasGastos1b += m.monto;
                        detExtras1b.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-danger">-S/. ${m.monto.toFixed(2)}</span></div>`);
                    }
                } else if (dia < 30 && dia < ultimoDiaMes) {
                    if (m.tipo === 'ingreso') {
                        extrasIngresos2a += m.monto;
                        detExtras2a.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-success">+S/. ${m.monto.toFixed(2)}</span></div>`);
                    } else {
                        extrasGastos2a += m.monto;
                        detExtras2a.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-danger">-S/. ${m.monto.toFixed(2)}</span></div>`);
                    }
                } else {
                    if (m.tipo === 'ingreso') {
                        extrasIngresos2b += m.monto;
                        detExtras2b.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-success">+S/. ${m.monto.toFixed(2)}</span></div>`);
                    } else {
                        extrasGastos2b += m.monto;
                        detExtras2b.push(`<div class="q-row"><span class="label">${tag}${escaparCuota(m.descripcion)}</span><span class="text-danger">-S/. ${m.monto.toFixed(2)}</span></div>`);
                    }
                }
            }
        });

        // 2. Aplicar movimientos fijos (Recurrentes) de forma virtual
        let fijosIngresos1a = 0, fijosGastos1a = 0; // Días 1-14
        let fijosIngresos1b = 0, fijosGastos1b = 0; // Día 15
        let fijosIngresos2a = 0, fijosGastos2a = 0; // Días 16 al penúltimo día
        let fijosIngresos2b = 0, fijosGastos2b = 0; // Día final (30/31)
        
        const detFijos1a = [];
        const detFijos1b = [];
        const detFijos2a = [];
        const detFijos2b = [];

        // Las ocurrencias pendientes ya llegan desde la agenda, sin duplicar plantillas.

        // Cálculo de saldo paso a paso
        const balanceInicioMes = balanceAcumulado;
        
        // 1a. Bolsillo disponible antes del día 15 (Días 1 a 14)
        const bolsilloAntes15 = balanceInicioMes + fijosIngresos1a + extrasIngresos1a - (fijosGastos1a + extrasGastos1a);
        
        // 1b. Resto tras 15na (Cobro de quincena del día 15)
        const balanceTras15 = bolsilloAntes15 + s15_aplicado + fijosIngresos1b + extrasIngresos1b - (fijosGastos1b + extrasGastos1b);
        
        // 2a. Bolsillo disponible antes de fin de mes (Días 16 al penúltimo día)
        const bolsilloAntesFinMes = balanceTras15 + fijosIngresos2a + extrasIngresos2a - (fijosGastos2a + extrasGastos2a);

        // 2b. Resto tras fin de mes (Cobro de sueldo de fin de mes en día 30/31)
        const balanceFinMes = bolsilloAntesFinMes + s30_aplicado + fijosIngresos2b + extrasIngresos2b - (fijosGastos2b + extrasGastos2b);

        balanceAcumulado = balanceFinMes;
        const ingresosMes = s15_aplicado + s30_aplicado + fijosIngresos1a + fijosIngresos1b + fijosIngresos2a + fijosIngresos2b + extrasIngresos1a + extrasIngresos1b + extrasIngresos2a + extrasIngresos2b;
        const gastosTotalesMes = fijosGastos1a + fijosGastos1b + fijosGastos2a + fijosGastos2b + extrasGastos1a + extrasGastos1b + extrasGastos2a + extrasGastos2b;
        const esPasado = añoActual < añoHoy || (añoActual === añoHoy && mesActual < mesHoy);

        proyecciones.push({
            anio: añoActual,
            mes: mesActual,
            label: `${nombresMeses[mesActual]} ${añoActual}`,
            labelCorto: `${nombresMeses[mesActual].slice(0, 3)} ${String(añoActual).slice(-2)}`,
            bolsilloAntes15,
            balanceTras15,
            bolsilloAntesFinMes,
            balanceFin: balanceFinMes,
            ingresos: ingresosMes,
            disponible: balanceInicioMes + ingresosMes,
            gastos: gastosTotalesMes,
            esPasado: esPasado
        });

        // Evaluar semáforo de alertas
        let claseBorde = '';
        let badgeAlerta = '';

        if (esPasado) {
            claseBorde = 'border-alert-secondary';
            badgeAlerta = `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1" style="font-size:0.65rem; font-weight:700;"><i class="fas fa-history me-1"></i>Concluido</span>`;
        } else if (balanceFinMes < 0) {
            claseBorde = 'border-alert-danger';
            badgeAlerta = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1" style="font-size:0.65rem; font-weight:700;"><i class="fas fa-heart-crack me-1"></i>Déficit</span>`;
        } else if (bolsilloAntes15 < 0 || balanceTras15 < 0 || bolsilloAntesFinMes < 0) {
            claseBorde = 'border-alert-warning';
            badgeAlerta = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1" style="font-size:0.65rem; font-weight:700;"><i class="fas fa-exclamation-triangle me-1"></i>Liquidez</span>`;
        }

        const item = document.createElement('div');
        item.className = 'col' + (esPasado && !mostrarHistorico ? ' d-none' : '');

        const colorBolsilloAntes15 = bolsilloAntes15 >= 0 ? 'text-success' : 'text-danger';
        const colorTras15  = balanceTras15  >= 0 ? 'text-success' : 'text-danger';
        const colorBolsilloAntesFinMes = bolsilloAntesFinMes >= 0 ? 'text-success' : 'text-danger';
        const colorFinMes  = balanceFinMes  >= 0 ? 'text-success' : 'text-danger';
        const claseFinal   = balanceFinMes  >= 0 ? '' : 'negativo';

        const llaveMes=`${añoActual}-${mesActual}`;
        const prefix=`${añoActual}-${String(mesActual+1).padStart(2,'0')}`;
        const filas=[...realizados.filter(m=>m.fecha.startsWith(prefix)).map(m=>({...m,estado:'realizado'})),...pendientes.filter(m=>m.fecha.startsWith(prefix)).map(m=>{const cuota=AppState.cuotasPendientes.find(c=>'cuota-'+c.id===m.id);return {...m,descripcion:cuota&&cuota.modalidad!=='cuotas'?cuota.nombre+' · Pago '+cuota.numero:m.descripcion.replace(/ \(pendiente\)$/,''),estado:'pendiente'};})];
        if(s15_aplicado)filas.push({descripcion:'Sueldo de quincena',tipo:'ingreso',monto:s15_aplicado,fecha:prefix+'-15',estado:'pendiente'});
        if(s30_aplicado)filas.push({descripcion:'Sueldo de fin de mes',tipo:'ingreso',monto:s30_aplicado,fecha:prefix+'-'+ultimoDiaMes,estado:'pendiente'});
        const incluidosMes=AppState.movimientos.filter(m=>m.fecha.startsWith(prefix)&&!movimientoPosteriorReferencia(m,referencia,incluidos)).map(m=>({...m,estado:'realizado',incluido:true}));
        detalleMeses.set(llaveMes,{titulo:nombresMeses[mesActual]+' '+añoActual,referencia:mesReferencia?referencia:null,filas,incluidos:incluidosMes});
        const desplegada=estadoTarjetaMes(llaveMes,añoActual===añoHoy&&mesActual===mesHoy);
        const hitos=[['Antes del 15',bolsilloAntes15,14],['Después de la quincena',balanceTras15,15],['Antes de fin de mes',bolsilloAntesFinMes,ultimoDiaMes-1]];
        item.innerHTML=`<article id="projection-${añoActual}-${mesActual}" tabindex="-1" class="card p-3 projection-item projection-compact ${claseBorde} shadow-sm">
         <details class="projection-fold" data-mes="${llaveMes}" ${desplegada?'open':''}><summary class="projection-fold-heading"><span><h3 class="h5 fw-bold mb-1">${nombresMeses[mesActual]} ${añoActual}</h3><span class="projection-fold-hint"><span class="fold-open-label">Ocultar quincenas</span><span class="fold-closed-label">Ver quincenas</span></span></span><span class="d-flex align-items-center gap-2">${badgeAlerta}<i class="fas fa-chevron-down" aria-hidden="true"></i></span></summary><div class="projection-fold-body">
         <div class="projection-start"><span>${mesReferencia?'Saldo real al '+referencia.split('-').reverse().join('/'):'Saldo del mes anterior'}</span><strong>${formatearMoneda(balanceInicioMes)}</strong></div>
         <p class="projection-expenses">${mesReferencia?'Gastos por aplicar':'Gastos proyectados'} <strong class="text-danger">${formatearMoneda(gastosTotalesMes)}</strong></p>
         <div class="projection-milestones">${hitos.map(([label,value,day],i)=>`<section><div class="projection-milestone"><span>${label}</span><strong class="${value<0?'text-danger':'text-success'}">${importeHito(value,añoActual,mesActual,day,referencia)}</strong></div>${enlaceTramo(filas,llaveMes,i)}</section>`).join('')}</div>
         </div></details>
         <div class="balance-final-mes ${claseFinal} mt-2 mb-0"><div class="projection-milestone"><span>Al cierre del mes</span><strong class="${colorFinMes}">${importeHito(balanceFinMes,añoActual,mesActual,ultimoDiaMes,referencia)}</strong></div>${enlaceTramo(filas,llaveMes,3)}</div>
         <button class="btn btn-sm btn-outline-secondary w-100 mt-3" type="button" data-detalle-mes="${llaveMes}" aria-label="Ver todos los movimientos de ${nombresMeses[mesActual]} ${añoActual}">Ver todos los movimientos <i class="fas fa-arrow-right ms-1" aria-hidden="true"></i></button>
        </article>`;
        contenedor.appendChild(item);
        item.querySelector('.projection-fold').addEventListener('toggle',event=>guardarEstadoTarjeta(event.currentTarget));

        mesActual++;
        if (mesActual > 11) {
            mesActual = 0;
            añoActual++;
        }
    }

    // Actualizar botón de toggle histórico con la cantidad de meses pasados
    const cantidadPasados = proyecciones.filter(p => p.esPasado).length;
    const btnToggle = document.getElementById('btn-toggle-historico');
    if (btnToggle) {
        if (cantidadPasados === 0) {
            btnToggle.style.display = 'none';
        } else {
            btnToggle.style.display = 'inline-block';
            if (mostrarHistorico) {
                btnToggle.innerHTML = `<i class="fas fa-eye-slash me-1"></i><span class="d-none d-sm-inline">Ocultar meses pasados</span><span class="d-sm-none">Ocultar</span> (${cantidadPasados})`;
                btnToggle.classList.remove('btn-outline-secondary');
                btnToggle.classList.add('btn-secondary');
            } else {
                btnToggle.innerHTML = `<i class="fas fa-history me-1"></i><span class="d-none d-sm-inline">Ver meses pasados</span><span class="d-sm-none">Pasados</span> (${cantidadPasados})`;
                btnToggle.classList.remove('btn-secondary');
                btnToggle.classList.add('btn-outline-secondary');
            }
        }
    }

    document.getElementById('alternar-tarjetas').textContent=document.querySelector('.projection-fold[open]')?'Contraer todos':'Expandir todos';
    if(document.getElementById('panel-detalle-mes').classList.contains('show'))renderDetalleMes();
    renderResumenFinanciero(proyecciones);
}
