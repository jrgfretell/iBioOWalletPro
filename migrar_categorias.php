<?php
// migrar_categorias.php
require_once 'conexion.php';

try {
    // Iniciar transacción
    $pdo->beginTransaction();

    // 1. Crear tabla categorias
    $sqlCategorias = "CREATE TABLE IF NOT EXISTS `categorias` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `nombre` VARCHAR(100) NOT NULL UNIQUE,
      `color` VARCHAR(7) NOT NULL DEFAULT '#3498db',
      `icono` VARCHAR(50) NOT NULL DEFAULT 'fa-folder',
      `creado_el` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    $pdo->exec($sqlCategorias);

    // 2. Insertar categorías iniciales
    $categoriasIniciales = [
        ['Servicios', '#e74c3c', 'fa-bolt'],
        ['Comida', '#e67e22', 'fa-utensils'],
        ['Educación', '#9b59b6', 'fa-graduation-cap'],
        ['Transporte', '#3498db', 'fa-car'],
        ['Salud', '#2ecc71', 'fa-heartbeat'],
        ['Otros', '#7f8c8d', 'fa-ellipsis-h']
    ];

    $stmtInsertCat = $pdo->prepare("INSERT INTO `categorias` (`nombre`, `color`, `icono`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `color`=VALUES(`color`), `icono`=VALUES(`icono`)");
    foreach ($categoriasIniciales as $cat) {
        $stmtInsertCat->execute($cat);
    }

    // Obtener el ID de la categoria "Otros"
    $stmtOtros = $pdo->prepare("SELECT id FROM `categorias` WHERE `nombre` = 'Otros'");
    $stmtOtros->execute();
    $idOtros = intval($stmtOtros->fetchColumn());

    // 3. Alterar movimientos_agenda para agregar columna categoria_id
    // Primero revisamos si la columna ya existe
    $stmtCheckAgenda = $pdo->query("SHOW COLUMNS FROM `movimientos_agenda` LIKE 'categoria_id'");
    $columnExistsAgenda = $stmtCheckAgenda->fetch();

    if (!$columnExistsAgenda) {
        // Agregar columna
        $pdo->exec("ALTER TABLE `movimientos_agenda` ADD COLUMN `categoria_id` INT DEFAULT NULL");
        // Asignar categoria "Otros" a los movimientos existentes
        if ($idOtros > 0) {
            $pdo->exec("UPDATE `movimientos_agenda` SET `categoria_id` = $idOtros WHERE `categoria_id` IS NULL");
        }
        // Crear relación (FK)
        $pdo->exec("ALTER TABLE `movimientos_agenda` ADD CONSTRAINT `fk_agenda_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL");
    }

    // 4. Alterar movimientos_recurrentes para agregar columna categoria_id
    // Primero revisamos si la columna ya existe
    $stmtCheckRecurrentes = $pdo->query("SHOW COLUMNS FROM `movimientos_recurrentes` LIKE 'categoria_id'");
    $columnExistsRecurrentes = $stmtCheckRecurrentes->fetch();

    if (!$columnExistsRecurrentes) {
        // Agregar columna
        $pdo->exec("ALTER TABLE `movimientos_recurrentes` ADD COLUMN `categoria_id` INT DEFAULT NULL");
        // Asignar categoria "Otros" a los movimientos existentes
        if ($idOtros > 0) {
            $pdo->exec("UPDATE `movimientos_recurrentes` SET `categoria_id` = $idOtros WHERE `categoria_id` IS NULL");
        }
        // Crear relación (FK)
        $pdo->exec("ALTER TABLE `movimientos_recurrentes` ADD CONSTRAINT `fk_recurrentes_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL");
    }

    // 5. Agregar columna periodos a movimientos_recurrentes si no existe
    $stmtCheckPeriodos = $pdo->query("SHOW COLUMNS FROM `movimientos_recurrentes` LIKE 'periodos'");
    $columnExistsPeriodos = $stmtCheckPeriodos->fetch();
    if (!$columnExistsPeriodos) {
        $pdo->exec("ALTER TABLE `movimientos_recurrentes` ADD COLUMN `periodos` TEXT DEFAULT NULL");
    }

    // Confirmar transacción
    $pdo->commit();

    echo json_encode([
        "success" => true,
        "message" => "Migración completada con éxito. Tablas actualizadas (Categorías y Periodos)."
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        "success" => false,
        "error" => "Error en la migración: " . $e->getMessage()
    ]);
}
?>
