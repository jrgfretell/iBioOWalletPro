<?php
// Ejecutar una sola vez después de desplegar esta versión y luego eliminar del servidor.
require_once 'conexion.php';

try {
    $columna = $pdo->query("SHOW COLUMNS FROM movimientos_agenda LIKE 'recurrente_id'");
    if (!$columna->fetch()) {
        $pdo->exec("ALTER TABLE movimientos_agenda ADD COLUMN recurrente_id INT NULL AFTER es_recurrente");
    }

    // Vincula los movimientos fijos existentes cuando la descripción corresponde a una única plantilla.
    $pdo->exec("UPDATE movimientos_agenda ma
                INNER JOIN movimientos_recurrentes mr
                    ON LOWER(TRIM(ma.descripcion)) = LOWER(TRIM(mr.descripcion))
                SET ma.recurrente_id = mr.id
                WHERE ma.es_recurrente = 1 AND ma.recurrente_id IS NULL");

    $indice = $pdo->query("SHOW INDEX FROM movimientos_agenda WHERE Key_name = 'uq_agenda_recurrente_fecha'");
    if (!$indice->fetch()) {
        $pdo->exec("ALTER TABLE movimientos_agenda ADD UNIQUE KEY uq_agenda_recurrente_fecha (recurrente_id, fecha)");
    }

    echo json_encode(["success" => true, "message" => "Migración de movimientos recurrentes completada."]);
} catch (PDOException $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
