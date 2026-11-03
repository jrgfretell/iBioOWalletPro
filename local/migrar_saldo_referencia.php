<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../conexion.php';
if(!$pdo->query("SHOW COLUMNS FROM config_billetera LIKE 'fecha_referencia'")->fetch()){
    $pdo->exec('ALTER TABLE config_billetera ADD fecha_referencia DATE NULL, ADD movimientos_incluidos MEDIUMTEXT NULL');
}
echo "Saldo con fecha de referencia instalado.\n";
