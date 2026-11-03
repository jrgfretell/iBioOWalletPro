// navbar.js
document.addEventListener("DOMContentLoaded", () => {
    renderSharedNavbar();
});

function renderSharedNavbar() {
    // Detectar en qué página estamos para poner el link activo
    const currentPath = window.location.pathname;
    const pageName = currentPath.split("/").pop() || "index.html";

    // --- 1. BARRA DE NAVEGACIÓN SUPERIOR (DESKTOP) ---
    // Oculta en móviles mediante la clase d-none d-lg-block
    const navDesktopHTML = `
        <nav class="navbar navbar-expand-lg navbar-dark shadow-sm py-3 mb-4 d-none d-lg-block" style="background: linear-gradient(135deg, #2c3e50, #1a252f); border-bottom: 2px solid #1abc9c;">
            <div class="container">
                <a class="navbar-brand d-flex align-items-center fw-bold" href="index.html">
                    <i class="fas fa-wallet me-2 text-accent" style="color: #1abc9c; font-size: 1.5rem;"></i>
                    <span>Mi Billetera <span style="color: #1abc9c;">Pro</span></span>
                </a>
                <div class="navbar-collapse collapse">
                    <ul class="navbar-nav ms-auto mb-2 mb-lg-0 gap-1">
                        <li class="nav-item">
                            <a class="nav-link px-3 ${pageName === 'index.html' || pageName === '' ? 'active fw-bold' : ''}" href="index.html">
                                <i class="fas fa-chart-line me-1"></i> Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link px-3 ${pageName === 'movimientos.html' ? 'active fw-bold' : ''}" href="movimientos.html">
                                <i class="fas fa-history me-1"></i> Movimientos
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link px-3 ${['pagos.html','plantilla.html','deudas.html'].includes(pageName) ? 'active fw-bold' : ''}" href="pagos.html">
                                <i class="fas fa-redo me-1"></i> Pagos programados
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link px-3 ${pageName === 'categorias.html' ? 'active fw-bold' : ''}" href="categorias.html">
                                <i class="fas fa-tags me-1"></i> Categorías
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    `;

    // --- 2. BARRA DE NAVEGACIÓN INFERIOR (MÓVIL) ---
    // Oculta en pantallas grandes mediante d-flex d-lg-none
    const navMobileHTML = `
        <div class="bottom-nav-bar fixed-bottom d-flex d-lg-none justify-content-around align-items-center">
            <a href="index.html" class="bottom-nav-item ${pageName === 'index.html' || pageName === '' ? 'active' : ''}">
                <i class="fas fa-chart-line"></i>
                <span>Dashboard</span>
            </a>
            <a href="movimientos.html" class="bottom-nav-item ${pageName === 'movimientos.html' ? 'active' : ''}">
                <i class="fas fa-history"></i>
                <span>Movimientos</span>
            </a>
            <a href="pagos.html" class="bottom-nav-item ${['pagos.html','plantilla.html','deudas.html'].includes(pageName) ? 'active' : ''}">
                <i class="fas fa-redo"></i>
                <span>Programados</span>
            </a>
            <a href="categorias.html" class="bottom-nav-item ${pageName === 'categorias.html' ? 'active' : ''}">
                <i class="fas fa-tags"></i>
                <span>Categorías</span>
            </a>
        </div>
    `;

    // Insertar la barra superior al principio del body
    const body = document.body;
    const headerContainer = document.createElement("div");
    headerContainer.innerHTML = navDesktopHTML;
    body.insertBefore(headerContainer.firstElementChild, body.firstChild);

    // Insertar la barra inferior al final del body
    const footerContainer = document.createElement("div");
    footerContainer.innerHTML = navMobileHTML;
    body.appendChild(footerContainer.firstElementChild);
}
