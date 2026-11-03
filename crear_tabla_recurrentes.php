<?php
// crear_tabla_recurrentes.php
require_once 'conexion.php';

try {
    $sql = "CREATE TABLE IF NOT EXISTS `movimientos_recurrentes` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `tipo` ENUM('gasto', 'ingreso') NOT NULL,
      `descripcion` VARCHAR(255) NOT NULL,
      `monto` DECIMAL(10,2) NOT NULL,
      `dia_pago` INT NOT NULL,
      `creado_el` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

    $pdo->exec($sql);
    echo json_encode(["success" => true, "message" => "Tabla 'movimientos_recurrentes' creada o ya existente de forma exitosa."]);
} catch (PDOException $e) {
    echo json_encode(["success" => false, "error" => "Error al crear la tabla: " . $e->getMessage()]);
}
?>
