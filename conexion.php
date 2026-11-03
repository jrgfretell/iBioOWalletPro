<?php
// conexion.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$config = require __DIR__ . '/config.local.php';
$host = $config['host'];
$db_name = $config['database'];
$username = $config['username'];
$password = $config['password'];
$port = $config['port'];
date_default_timezone_set('America/Lima');

try {
    $pdo = new PDO("mysql:host=" . $host . ";port=" . $port . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch(PDOException $exception) {
    http_response_code(500);
    error_log('Error MySQL local: ' . $exception->getMessage());
    echo json_encode(["success" => false, "error" => "No se pudo conectar a MySQL local. Revisa config.local.php y el servicio MySQL."]);
    exit();
}
?>
