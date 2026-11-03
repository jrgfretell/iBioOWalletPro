let AppState = {
    categorias: []
};

const PRESET_COLORS = [
    '#e74c3c', '#c0392b', '#ff7675', '#fd79a8', '#e84393', '#d63031',
    '#e67e22', '#f1c40f', '#f39c12', '#d35400', '#fdcb6e', '#e17055',
    '#2ecc71', '#27ae60', '#1abc9c', '#16a085', '#00b894', '#55efc4',
    '#3498db', '#2980b9', '#0984e3', '#74b9ff', '#1e3799', '#54a0ff',
    '#9b59b6', '#8e44ad', '#a29bfe', '#6c5ce7', '#34495e', '#2c3e50',
    '#7f8c8d', '#b2bec3', '#ffeaa7', '#636e72', '#10ac84'
];

const PRESET_ICONS = [
    // Generales e Identificación
    'fa-tag', 'fa-folder', 'fa-star', 'fa-heart', 'fa-gift', 'fa-wallet',
    // Vivienda y Servicios del Hogar
    'fa-home', 'fa-bolt', 'fa-water', 'fa-plug', 'fa-wifi', 'fa-tv', 'fa-couch',
    // Educación e Hijos
    'fa-graduation-cap', 'fa-school', 'fa-child', 'fa-book', 'fa-chalkboard-user',
    // Transporte y Viajes
    'fa-car', 'fa-bus', 'fa-van-shuttle', 'fa-motorcycle', 'fa-gas-pump', 'fa-plane', 'fa-route',
    // Alimentación y Salidas
    'fa-utensils', 'fa-coffee', 'fa-pizza-slice', 'fa-ice-cream', 'fa-beer-mug-empty', 'fa-wine-glass',
    // Telecomunicaciones
    'fa-mobile-screen', 'fa-phone',
    // Finanzas, Bancos y Préstamos
    'fa-landmark', 'fa-hand-holding-dollar', 'fa-money-bill-wave', 'fa-credit-card', 'fa-percent', 'fa-receipt',
    // Compras
    'fa-shopping-cart', 'fa-basket-shopping', 'fa-bag-shopping',
    // Salud y Seguros
    'fa-heartbeat', 'fa-stethoscope', 'fa-pills', 'fa-shield-halved',
    // Ocio y Deporte
    'fa-gamepad', 'fa-film', 'fa-music', 'fa-ticket', 'fa-dumbbell',
    // Trabajo, Mascotas y Servicios Varios
    'fa-briefcase', 'fa-tools', 'fa-scissors', 'fa-paw', 'fa-key',
    // Ahorro, inversiones y administración
    'fa-piggy-bank', 'fa-coins', 'fa-money-bill-transfer', 'fa-chart-line', 'fa-calculator', 'fa-vault',
    // Tecnología y equipos
    'fa-laptop', 'fa-desktop', 'fa-keyboard', 'fa-print', 'fa-camera', 'fa-headphones',
    // Salud y cuidado personal
    'fa-hospital', 'fa-tooth', 'fa-syringe', 'fa-glasses', 'fa-wheelchair', 'fa-kit-medical',
    // Movilidad y turismo
    'fa-bicycle', 'fa-train', 'fa-taxi', 'fa-ship', 'fa-suitcase-rolling', 'fa-map-location-dot',
    // Ropa, familia, animales y jardín
    'fa-shirt', 'fa-shoe-prints', 'fa-baby', 'fa-dog', 'fa-cat', 'fa-seedling'
];

let modalCategoriaObj;

document.addEventListener("DOMContentLoaded", () => {
    modalCategoriaObj = new bootstrap.Modal(document.getElementById('modal-categoria'));
    inicializarFormularioPresets();
    cargarDatosDesdeBD();
    actualizarPreviewEnVivo();

    // Buscador de Iconos en tiempo real
    const searchInput = document.getElementById('buscar-icono');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.preset-icon').forEach(item => {
                const icon = item.dataset.icon || '';
                // Remover el prefijo fa- para búsquedas más flexibles
                const iconShortName = icon.replace('fa-', '').toLowerCase();
                if (icon.toLowerCase().includes(query) || iconShortName.includes(query) || query === '') {
                    item.style.setProperty('display', 'inline-flex', 'important');
                } else {
                    item.style.setProperty('display', 'none', 'important');
                }
            });
        });
    }
});

function inicializarFormularioPresets() {
    // Generar colores sugeridos
    const colorsContainer = document.getElementById('preset-colors-container');
    colorsContainer.innerHTML = '';
    PRESET_COLORS.forEach((color, idx) => {
        const colorEl = document.createElement('div');
        colorEl.className = 'preset-color' + (idx === 5 ? ' active' : ''); // Default #3498db
        colorEl.style.backgroundColor = color;
        colorEl.dataset.color = color;
        colorEl.onclick = () => seleccionarColorPreset(color, colorEl);
        colorsContainer.appendChild(colorEl);
    });

    // Generar iconos sugeridos
    const iconsContainer = document.getElementById('preset-icons-container');
    iconsContainer.innerHTML = '';
    PRESET_ICONS.forEach((icon, idx) => {
        const iconEl = document.createElement('div');
        iconEl.className = 'preset-icon' + (icon === 'fa-folder' ? ' active' : '');
        iconEl.innerHTML = `<i class="fas ${icon}"></i>`;
        iconEl.dataset.icon = icon;
        iconEl.onclick = () => seleccionarIconoPreset(icon, iconEl);
        iconsContainer.appendChild(iconEl);
    });
}

function seleccionarColorPreset(color, element) {
    document.querySelectorAll('.preset-color').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('cat-color').value = color;
    actualizarPreviewEnVivo();
}

function seleccionarColorPersonalizado(color) {
    // Buscar si coincide con alguno preestablecido y marcarlo
    document.querySelectorAll('.preset-color').forEach(el => {
        if (el.dataset.color.toLowerCase() === color.toLowerCase()) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    actualizarPreviewEnVivo();
}

function seleccionarIconoPreset(icon, element) {
    document.querySelectorAll('.preset-icon').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('cat-icono').value = icon;
    actualizarPreviewEnVivo();
}

// --- FETCH: Obtener datos desde backend ---
async function cargarDatosDesdeBD() {
    try {
        const response = await fetch('obtener_datos.php?t=' + new Date().getTime());
        const res = await response.json();
        if(res.success) {
            AppState.categorias = res.categorias || [];
            renderCategorias();
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error de Conexión', 'No se pudo conectar con el servidor.', 'error');
    }
}

function renderCategorias() {
    const container = document.getElementById('contenedor-categorias');
    container.innerHTML = '';

    document.getElementById('txt-total-categorias').innerText = AppState.categorias.length;

    if(AppState.categorias.length === 0) {
        container.innerHTML = `<div class="col-12 text-center text-muted py-3">No hay categorías registradas. Crea una a la izquierda.</div>`;
        return;
    }

    AppState.categorias.forEach(cat => {
        const col = document.createElement('div');
        col.className = 'col';

        col.innerHTML = `
            <div class="card category-card p-3 h-100 text-center border-top border-5" style="border-top-color: ${cat.color} !important;" onclick="prepararEdicion(${cat.id})">
                <div class="d-flex justify-content-center">
                    <div class="icon-circle" style="background-color: ${cat.color};">
                        <i class="fas ${cat.icono}"></i>
                    </div>
                </div>
                <h6 class="fw-bold text-dark mb-1 text-truncate">${cat.nombre}</h6>
                <div class="d-flex justify-content-center gap-2 mt-3" onclick="event.stopPropagation();">
                    <button class="btn btn-sm btn-link text-primary p-0" onclick="prepararEdicion(${cat.id})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarCategoria(${cat.id})">
                        <i class="fas fa-trash-alt"></i> Borrar
                    </button>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
}

// --- CONTROL DEL MODAL DE CREACIÓN/EDICIÓN ---
function abrirModalCrear() {
    document.getElementById('cat-id').value = '';
    document.getElementById('form-categoria').reset();
    
    // Textos del modal
    document.getElementById('modalCategoriaLabel').innerHTML = '<i class="fas fa-plus-circle me-2 text-primary"></i>Nueva Categoría';
    document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-save me-1"></i>Guardar Categoría';

    // Reset presets
    document.querySelectorAll('.preset-color').forEach((el, idx) => {
        if(idx === 5) el.classList.add('active');
        else el.classList.remove('active');
    });
    document.getElementById('cat-color').value = '#3498db';

    document.querySelectorAll('.preset-icon').forEach(el => {
        if(el.dataset.icon === 'fa-folder') el.classList.add('active');
        else el.classList.remove('active');
    });
    document.getElementById('cat-icono').value = 'fa-folder';

    // Resetear buscador de iconos
    const searchInput = document.getElementById('buscar-icono');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.preset-icon').forEach(item => {
        item.style.setProperty('display', 'inline-flex', 'important');
    });

    actualizarPreviewEnVivo();
    modalCategoriaObj.show();
}

// --- CRUD Categoría ---
async function guardarCategoria(e) {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const nombre = document.getElementById('cat-nombre').value.trim();
    const color = document.getElementById('cat-color').value;
    const icono = document.getElementById('cat-icono').value;

    try {
        const response = await fetch('gestion_movimientos.php?action=guardar_categoria', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, nombre, color, icono })
        });
        const res = await response.json();
        if(res.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Categoría guardada', showConfirmButton: false, timer: 2000 });
            modalCategoriaObj.hide();
            cargarDatosDesdeBD();
        } else {
            Swal.fire('Error', res.error, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Fallo al guardar la categoría.', 'error');
    }
}

function prepararEdicion(id) {
    const cat = AppState.categorias.find(c => c.id == id);
    if(!cat) return;

    document.getElementById('cat-id').value = cat.id;
    document.getElementById('cat-nombre').value = cat.nombre;
    document.getElementById('cat-color').value = cat.color;
    document.getElementById('cat-icono').value = cat.icono;

    // Seleccionar color en presets si existe
    seleccionarColorPersonalizado(cat.color);

    // Seleccionar icono en presets
    document.querySelectorAll('.preset-icon').forEach(el => {
        if (el.dataset.icon === cat.icono) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Cambiar estados del modal
    document.getElementById('modalCategoriaLabel').innerHTML = '<i class="fas fa-edit me-2 text-warning"></i>Editar Categoría';
    document.getElementById('btn-submit-form').innerHTML = '<i class="fas fa-edit me-1"></i>Actualizar Categoría';
    
    actualizarPreviewEnVivo();
    modalCategoriaObj.show();
}

function cancelarEdicion() {
    modalCategoriaObj.hide();
}

function actualizarPreviewEnVivo() {
    const nombre = document.getElementById('cat-nombre').value.trim() || 'Nueva Categoría';
    const color = document.getElementById('cat-color').value;
    const icono = document.getElementById('cat-icono').value || 'fa-folder';

    document.getElementById('preview-category-name').innerText = nombre;
    document.getElementById('preview-category-tag').style.backgroundColor = color;
    document.getElementById('preview-category-icon').className = `fas ${icono}`;
}

function eliminarCategoria(id) {
    const cat = AppState.categorias.find(c => c.id == id);
    if(!cat) return;

    // Evitar eliminar la categoría 'Otros' para prevenir problemas si es la por defecto
    if (cat.nombre.toLowerCase() === 'otros') {
        Swal.fire('Acción Prohibida', 'No puedes eliminar la categoría "Otros", es utilizada por defecto.', 'warning');
        return;
    }

    Swal.fire({
        title: '¿Eliminar Categoría?',
        text: `Si eliminas "${cat.nombre}", todos los movimientos que la tengan asignada pasarán a no tener categoría o a usar la categoría por defecto.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch('gestion_movimientos.php?action=eliminar_categoria', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const res = await response.json();
                if(res.success) {
                    Swal.fire('Borrada', 'Categoría eliminada.', 'success');
                    cancelarEdicion();
                    cargarDatosDesdeBD();
                } else {
                    Swal.fire('Error', res.error, 'error');
                }
            } catch (error) {
                Swal.fire('Error', 'Fallo al eliminar la categoría.', 'error');
            }
        }
    });
}
