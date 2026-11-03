<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../conexion.php';
// Los registros anteriores conservan su condición de movimientos realizados.
if (!$pdo->query("SHOW COLUMNS FROM movimientos_agenda LIKE 'pago_confirmado'")->fetch()) {
    $pdo->exec('ALTER TABLE movimientos_agenda ADD pago_confirmado TINYINT(1) NOT NULL DEFAULT 1, ADD fecha_pago DATE NULL');
}
echo "Pagos programados: estructura lista.\n";
