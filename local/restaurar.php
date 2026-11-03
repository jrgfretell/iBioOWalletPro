<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$config = require dirname(__DIR__) . '/config.local.php';
$backup = dirname(__DIR__) . '/MySQL/BackUp_02-11-26/ezyro_42390480_billetera_db.sql';
try {
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};charset=utf8mb4",
        $config['username'], $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $name = $config['database'];
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $name)) {
        throw new RuntimeException('Nombre de base de datos inválido.');
    }
    $sql = file_get_contents($backup);
    if ($sql === false) {
        throw new RuntimeException('No se pudo leer el respaldo.');
    }
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    $pdo->exec("USE `$name`");
    if ($pdo->query('SHOW TABLES')->fetchColumn() !== false) {
        throw new RuntimeException('La base ya contiene tablas. No se sobrescribió ningún dato.');
    }
    $pdo->exec($sql);
    require __DIR__ . '/migrar_deudas.php';
    foreach (['categorias', 'config_billetera', 'movimientos_agenda', 'movimientos_recurrentes', 'sueldos_mes'] as $table) {
        $count = $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
        echo "$table: $count registros" . PHP_EOL;
    }
    echo "Restauración completada en $name." . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
