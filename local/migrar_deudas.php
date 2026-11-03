<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/conexion.php';
$pdo->exec("CREATE TABLE IF NOT EXISTS deudas (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(150) NOT NULL,
 monto_recibido DECIMAL(10,2) NOT NULL,
 categoria_id INT NULL,
 creado_el TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS deuda_cuotas (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 deuda_id INT NOT NULL,
 numero INT NOT NULL,
 fecha DATE NOT NULL,
 monto DECIMAL(10,2) NOT NULL,
 UNIQUE KEY cuota_numero(deuda_id,numero),
 FOREIGN KEY (deuda_id) REFERENCES deudas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS deuda_pagos (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 cuota_id INT NOT NULL,
 movimiento_id INT NOT NULL UNIQUE,
 monto DECIMAL(10,2) NOT NULL,
 fecha DATE NOT NULL,
 solicitud VARCHAR(64) NOT NULL UNIQUE,
 creado_el TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (cuota_id) REFERENCES deuda_cuotas(id) ON DELETE RESTRICT,
 FOREIGN KEY (movimiento_id) REFERENCES movimientos_agenda(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
echo "Módulo de deudas instalado. Los registros existentes se conservaron.\n";

require __DIR__ . '/migrar_programados.php';

require __DIR__ . '/migrar_cronogramas.php';

require __DIR__ . '/migrar_saldo_referencia.php';
