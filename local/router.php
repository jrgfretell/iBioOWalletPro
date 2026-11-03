<?php
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$pages = ['/', '/index.html', '/categorias.html', '/movimientos.html', '/plantilla.html',
    '/obtener_datos.php', '/gestion_movimientos.php', '/guardar_sueldos.php', '/pagos.html', '/gestion_programados.php', '/deudas.html', '/gestion_deudas.php'];
$isAsset = preg_match('~^/(scripts|styles)/[a-zA-Z0-9_/-]+\.(js|css)$~D', $path);
if (!in_array($path, $pages, true) && !$isAsset) {
    http_response_code(404);
    exit('No encontrado');
}
return false;
