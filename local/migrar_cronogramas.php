<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../conexion.php';
require_once __DIR__.'/../deudas_lib.php';
require_once __DIR__.'/../cronogramas_lib.php';
if(!$pdo->query("SHOW COLUMNS FROM deudas LIKE 'modalidad'")->fetch())$pdo->exec("ALTER TABLE deudas ADD modalidad VARCHAR(12) NOT NULL DEFAULT 'cuotas', ADD frecuencia VARCHAR(12) NOT NULL DEFAULT 'mensual', ADD inicio DATE NULL, ADD fin DATE NULL, ADD importe DECIMAL(10,2) NULL");
if(!$pdo->query("SHOW COLUMNS FROM deuda_cuotas LIKE 'posicion'")->fetch())$pdo->exec('ALTER TABLE deuda_cuotas ADD posicion INT NULL, ADD omitida TINYINT NOT NULL DEFAULT 0, ADD UNIQUE KEY posicion_cronograma(deuda_id,posicion)');
if(!$pdo->query("SHOW COLUMNS FROM deudas LIKE 'tarifas'")->fetch())$pdo->exec('ALTER TABLE deudas ADD tarifas TEXT NULL');
if(!$pdo->query("SHOW COLUMNS FROM movimientos_recurrentes LIKE 'cronograma_id'")->fetch())$pdo->exec('ALTER TABLE movimientos_recurrentes ADD cronograma_id INT NULL');
if(!$pdo->query("SHOW COLUMNS FROM deudas LIKE 'fin_mes'")->fetch())$pdo->exec('ALTER TABLE deudas ADD fin_mes TINYINT NOT NULL DEFAULT 0');
$pdo->beginTransaction();
try {
 foreach($pdo->query("SELECT * FROM movimientos_recurrentes WHERE tipo='gasto' AND cronograma_id IS NULL FOR UPDATE")->fetchAll() as $r){
    $stmt=$pdo->prepare('SELECT * FROM movimientos_agenda WHERE recurrente_id=? ORDER BY fecha,id FOR UPDATE');$stmt->execute([$r['id']]);$movs=$stmt->fetchAll();
    $inicio=$movs?$movs[0]['fecha']:date('Y-m-').str_pad(min((int)$r['dia_pago'],(int)date('t')),2,'0',STR_PAD_LEFT);
    $modo=empty($r['periodos'])?'continuo':'cuotas';
    $pdo->prepare('INSERT INTO deudas(nombre,monto_recibido,categoria_id,modalidad,frecuencia,inicio,importe) VALUES(?,0,?,?,?,?,?)')->execute([$r['descripcion'],$r['categoria_id'],$modo,$r['tipo_recurrencia']==='semanal'?'semanal':'mensual',$inicio,$r['monto']]);$id=$pdo->lastInsertId();
    foreach($movs as $i=>$m){
        $pdo->prepare('INSERT INTO deuda_cuotas(deuda_id,numero,fecha,monto,posicion) VALUES(?,?,?,?,?)')->execute([$id,$i+1,$m['fecha'],$m['monto'],$i]);$cuota=$pdo->lastInsertId();
        if($m['pago_confirmado']){
            $fecha=$m['fecha_pago']?:$m['fecha'];
            $pdo->prepare('INSERT INTO deuda_pagos(cuota_id,movimiento_id,monto,fecha,solicitud) VALUES(?,?,?,?,?)')->execute([$cuota,$m['id'],$m['monto'],$fecha,'migrado-recurrente-'.$m['id']]);
            $pdo->prepare('UPDATE movimientos_agenda SET es_recurrente=0,recurrente_id=NULL,fecha=? WHERE id=?')->execute([$fecha,$m['id']]);
        }else $pdo->prepare('DELETE FROM movimientos_agenda WHERE id=?')->execute([$m['id']]);
    }
    $pdo->prepare('UPDATE movimientos_recurrentes SET cronograma_id=? WHERE id=?')->execute([$id,$r['id']]);
    ampliarCronograma($pdo,$id);
 }
 $pdo->commit();echo "Cronogramas migrados; pagos históricos conservados.\n";
}catch(Throwable $e){$pdo->rollBack();throw $e;}
