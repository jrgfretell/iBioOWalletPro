<?php
require __DIR__ . '/conexion.php';
require __DIR__ . '/deudas_lib.php';
header('Cache-Control: no-store');
try {
    $action = $_GET['action'] ?? 'listar';
    if ($action === 'listar') {
        echo json_encode(['success'=>true] + obtenerDeudas($pdo));
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new InvalidArgumentException('Usa POST para guardar cambios.');
    $data = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    $pdo->beginTransaction();
    switch ($action) {
        case 'crear':
            $nombre = trim($data['nombre'] ?? '');
            if ($nombre === '' || mb_strlen($nombre)>150) throw new InvalidArgumentException('Ingresa un nombre de hasta 150 caracteres.');
            $recibido = dineroCentavos($data['monto_recibido'] ?? '');
            $cuotas = $data['cuotas'] ?? [];
            if (!is_array($cuotas) || count($cuotas)<1 || count($cuotas)>360) throw new InvalidArgumentException('Registra entre 1 y 360 cuotas.');
            $stmt=$pdo->prepare('INSERT INTO deudas(nombre,monto_recibido,categoria_id) VALUES(?,?,?)');
            $stmt->execute([$nombre,decimalCentavos($recibido),($data['categoria_id'] ?? null) ?: null]);
            $id=(int)$pdo->lastInsertId();
            $stmt=$pdo->prepare('INSERT INTO deuda_cuotas(deuda_id,numero,fecha,monto) VALUES(?,?,?,?)');
            $anterior = '';
            foreach ($cuotas as $i=>$cuota) {
                $fecha=fechaValida($cuota['fecha'] ?? null);
                if ($fecha < $anterior) throw new InvalidArgumentException('Las fechas de las cuotas deben estar ordenadas.');
                $anterior=$fecha;
                $monto=dineroCentavos($cuota['monto'] ?? '');
                if ($monto<=0) throw new InvalidArgumentException('Cada cuota debe ser mayor que cero.');
                $stmt->execute([$id,$i+1,$fecha,decimalCentavos($monto)]);
                $cuotaId=(int)$pdo->lastInsertId();
                if (!empty($cuota['pagada'])) registrarPagoCuota($pdo,$cuotaId,decimalCentavos($monto),$cuota['fecha_pago'] ?? $fecha,bin2hex(random_bytes(16)));
            }
            $pdo->prepare('UPDATE deudas SET fin_mes=? WHERE id=?')->execute([!empty($data['fin_mes'])&&($data['frecuencia']??'mensual')==='mensual'?1:0,$id]);
            if (($data['modalidad'] ?? 'cuotas') !== 'cuotas') {
                $pdo->prepare('UPDATE deuda_cuotas SET posicion=numero-1 WHERE deuda_id=?')->execute([$id]);
                configurarCronograma($pdo,$id,$data);
            }
            break;
        case 'configurar':
            $id=(int)($data['id']??0);
            $stmt=$pdo->prepare('SELECT * FROM deudas WHERE id=? FOR UPDATE');$stmt->execute([$id]);$d=$stmt->fetch();
            if(!$d)throw new InvalidArgumentException('Cronograma no encontrado.');
            if($d['modalidad']==='cuotas'){
                $stmt=$pdo->prepare('SELECT * FROM deuda_cuotas WHERE deuda_id=? ORDER BY numero');$stmt->execute([$id]);$rows=$stmt->fetchAll();
                if(!$rows)throw new InvalidArgumentException('El cronograma no tiene vencimientos.');
                $d['inicio']=$rows[0]['fecha'];$d['importe']=$rows[count($rows)-1]['monto'];
                foreach($rows as $index=>$row)$pdo->prepare('UPDATE deuda_cuotas SET posicion=? WHERE id=?')->execute([$index,$row['id']]);
                $freq=$data['frecuencia']??'mensual';if(!in_array($freq,['mensual','semanal','quincenal'],true))throw new InvalidArgumentException('Frecuencia inválida.');
                $pdo->prepare('UPDATE deudas SET inicio=?,frecuencia=? WHERE id=?')->execute([$d['inicio'],$freq,$id]);
            }
            $fin=($data['modalidad']??'continuo')==='fecha'?fechaValida($data['fin']??null):null;
            if($fin && $fin<$d['inicio'])throw new InvalidArgumentException('El término no puede ser anterior al inicio.');
            if(!in_array($data['modalidad']??'', ['fecha','continuo'],true))throw new InvalidArgumentException('Modalidad inválida.');
            // Se retiran únicamente vencimientos completos sin ningún abono.
            if($fin){
                $pdo->prepare('DELETE c FROM deuda_cuotas c WHERE c.deuda_id=? AND c.fecha>? AND NOT EXISTS(SELECT 1 FROM deuda_pagos p WHERE p.cuota_id=c.id)')->execute([$id,$fin]);
            }
            $importe=dineroCentavos($data['importe']??$d['importe']);if($importe<=0)throw new InvalidArgumentException('Importe inválido.');
            $desde=fechaValida($data['desde']??date('Y-m-d'));
            $pdo->prepare('UPDATE deuda_cuotas c SET monto=? WHERE deuda_id=? AND fecha>=? AND omitida=0 AND NOT EXISTS(SELECT 1 FROM deuda_pagos p WHERE p.cuota_id=c.id)')->execute([decimalCentavos($importe),$id,$desde]);
            $tarifas=json_decode($d['tarifas']??'[]',true)?:[['desde'=>$d['inicio'],'monto'=>$d['importe']]];
            $tarifas=array_values(array_filter($tarifas,fn($t)=>$t['desde']<$desde));
            $tarifas[]=['desde'=>$desde,'monto'=>decimalCentavos($importe)];
            usort($tarifas,fn($a,$b)=>strcmp($a['desde'],$b['desde']));
            $pdo->prepare('UPDATE deudas SET modalidad=?,fin=?,tarifas=? WHERE id=?')->execute([$data['modalidad'],$fin,json_encode($tarifas),$id]);
            ampliarCronograma($pdo,$id);
            break;
        case 'omitir':
            $stmt=$pdo->prepare('SELECT * FROM deuda_cuotas WHERE id=? FOR UPDATE');$stmt->execute([(int)($data['id']??0)]);$c=$stmt->fetch();
            if(!$c)throw new InvalidArgumentException('Vencimiento no encontrado.');
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM deuda_pagos WHERE cuota_id=?');$stmt->execute([$c['id']]);
            if($stmt->fetchColumn())throw new InvalidArgumentException('Este vencimiento tiene abonos.');
            $pdo->prepare('UPDATE deuda_cuotas SET omitida=? WHERE id=?')->execute([empty($data['restaurar'])?1:0,$c['id']]);
            break;
        case 'editar':
            $id=(int)($data['id'] ?? 0);
            $stmt=$pdo->prepare('SELECT id,modalidad FROM deudas WHERE id=? FOR UPDATE');
            $stmt->execute([$id]);
            $cronograma=$stmt->fetch();
            if (!$cronograma) throw new InvalidArgumentException('Cronograma no encontrado.');
            $nombre=trim($data['nombre'] ?? '');
            if ($nombre==='' || mb_strlen($nombre)>150) throw new InvalidArgumentException('Ingresa un nombre de hasta 150 caracteres.');
            $recibido=dineroCentavos($data['monto_recibido'] ?? '');
            $cuotas=$data['cuotas'] ?? [];
            if (!is_array($cuotas) || count($cuotas)<1 || count($cuotas)>360) throw new InvalidArgumentException('Registra entre 1 y 360 cuotas.');
            $stmt=$pdo->prepare('SELECT * FROM deuda_cuotas WHERE deuda_id=? ORDER BY numero FOR UPDATE');
            $stmt->execute([$id]);
            $anteriores=[];
            foreach($stmt->fetchAll() as $cuota) $anteriores[(int)$cuota['id']]=$cuota;
            $stmt=$pdo->prepare('SELECT p.cuota_id,COUNT(*) AS cantidad FROM deuda_pagos p JOIN deuda_cuotas c ON c.id=p.cuota_id WHERE c.deuda_id=? GROUP BY p.cuota_id');
            $stmt->execute([$id]);
            $conPagos=array_column($stmt->fetchAll(),'cantidad','cuota_id');
            $ids=[];
            foreach($cuotas as $i=>$cuota) {
                $cuotaId=(int)($cuota['id'] ?? 0);
                $monto=dineroCentavos($cuota['monto'] ?? '');
                $fecha=fechaValida($cuota['fecha'] ?? null);
                if ($monto<=0) throw new InvalidArgumentException('Cada cuota debe ser mayor que cero.');
                if ($cuotaId) {
                    if (!isset($anteriores[$cuotaId]) || isset($ids[$cuotaId])) throw new InvalidArgumentException('La cuota no pertenece al cronograma o está repetida.');
                    $old=$anteriores[$cuotaId];
                    if ($cronograma['modalidad']==='cuotas' && (int)$old['numero']!==$i+1) throw new InvalidArgumentException('Solo puedes retirar cuotas desde el final para conservar su numeración.');
                    if (isset($conPagos[$cuotaId]) && ($monto!==dineroCentavos($old['monto']) || $fecha!==$old['fecha'])) throw new InvalidArgumentException('La cuota '.$old['numero'].' tiene pagos: anúlalos antes de cambiar su fecha o importe.');
                    $ids[$cuotaId]=true;
                }
            }
            foreach($anteriores as $cuotaId=>$old) {
                if (!isset($ids[$cuotaId])) {
                    if (isset($conPagos[$cuotaId])) throw new InvalidArgumentException('No puedes quitar una cuota con pagos.');
                    $pdo->prepare('DELETE FROM deuda_cuotas WHERE id=?')->execute([$cuotaId]);
                }
            }
            foreach($cuotas as $i=>$cuota) {
                $cuotaId=(int)($cuota['id'] ?? 0);
                if ($cuotaId) $pdo->prepare('UPDATE deuda_cuotas SET monto=?,fecha=? WHERE id=?')->execute([decimalCentavos(dineroCentavos($cuota['monto'])),$cuota['fecha'],$cuotaId]);
                else $pdo->prepare('INSERT INTO deuda_cuotas(deuda_id,numero,fecha,monto) VALUES(?,?,?,?)')->execute([$id,$i+1,$cuota['fecha'],decimalCentavos(dineroCentavos($cuota['monto']))]);
            }
            $pdo->prepare('UPDATE deudas SET nombre=?,monto_recibido=?,categoria_id=? WHERE id=?')->execute([$nombre,decimalCentavos($recibido),($data['categoria_id'] ?? null) ?: null,$id]);
            break;
        case 'pagar':
            registrarPagoCuota($pdo,(int)($data['cuota_id'] ?? 0),$data['monto'] ?? '',$data['fecha'] ?? null,$data['solicitud'] ?? null);
            break;
        case 'anular_pago':
            $stmt=$pdo->prepare('SELECT * FROM deuda_pagos WHERE id=?');
            $stmt->execute([(int)($data['id'] ?? 0)]);
            $pago=$stmt->fetch();
            if (!$pago) throw new InvalidArgumentException('Pago no encontrado.');
            $stmt=$pdo->prepare('SELECT id FROM deuda_cuotas WHERE id=? FOR UPDATE');
            $stmt->execute([$pago['cuota_id']]);
            $stmt=$pdo->prepare('SELECT * FROM deuda_pagos WHERE id=? FOR UPDATE');
            $stmt->execute([$pago['id']]);
            if (!$stmt->fetch()) throw new InvalidArgumentException('El pago ya fue anulado.');
            $pdo->prepare('DELETE FROM deuda_pagos WHERE id=?')->execute([$pago['id']]);
            $pdo->prepare('DELETE FROM movimientos_agenda WHERE id=?')->execute([$pago['movimiento_id']]);
            break;
        case 'editar_cuota':
            $stmt=$pdo->prepare('SELECT * FROM deuda_cuotas WHERE id=? FOR UPDATE');
            $stmt->execute([(int)($data['id'] ?? 0)]);
            $cuota=$stmt->fetch();
            if (!$cuota) throw new InvalidArgumentException('Cuota no encontrada.');
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM deuda_pagos WHERE cuota_id=?');
            $stmt->execute([$cuota['id']]);
            if ($stmt->fetchColumn()>0) throw new InvalidArgumentException('Anula los pagos de esta cuota antes de modificarla.');
            $monto=dineroCentavos($data['monto'] ?? '');
            if ($monto<=0) throw new InvalidArgumentException('El importe debe ser mayor que cero.');
            $pdo->prepare('UPDATE deuda_cuotas SET monto=?,fecha=? WHERE id=?')->execute([decimalCentavos($monto),fechaValida($data['fecha'] ?? null),$cuota['id']]);
            break;
        case 'eliminar':
            $stmt=$pdo->prepare('SELECT id FROM deudas WHERE id=? FOR UPDATE');
            $stmt->execute([(int)($data['id'] ?? 0)]);
            if (!$stmt->fetch()) throw new InvalidArgumentException('Deuda no encontrada.');
            $stmt=$pdo->prepare('SELECT id FROM deuda_cuotas WHERE deuda_id=? FOR UPDATE');
            $stmt->execute([$data['id']]); $stmt->fetchAll();
            $stmt=$pdo->prepare('SELECT p.movimiento_id FROM deuda_pagos p JOIN deuda_cuotas c ON c.id=p.cuota_id WHERE c.deuda_id=?');
            $stmt->execute([$data['id']]);
            $movimientos=$stmt->fetchAll(PDO::FETCH_COLUMN);
            $modo=$data['pagos'] ?? null;
            if ($movimientos && !in_array($modo,['conservar','eliminar'],true)) throw new InvalidArgumentException('Indica si deseas conservar o eliminar los gastos de los pagos realizados.');
            $pdo->prepare('DELETE p FROM deuda_pagos p JOIN deuda_cuotas c ON c.id=p.cuota_id WHERE c.deuda_id=?')->execute([$data['id']]);
            if ($modo==='eliminar') {
                $stmt=$pdo->prepare('DELETE FROM movimientos_agenda WHERE id=?');
                foreach($movimientos as $movimientoId) $stmt->execute([$movimientoId]);
            }
            $pdo->prepare('DELETE FROM deudas WHERE id=?')->execute([$data['id']]);
            break;
        default: throw new InvalidArgumentException('Acción no válida.');
    }
    $pdo->commit();
    echo json_encode(['success'=>true]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['success'=>false,'error'=>$error->getMessage()]);
}
