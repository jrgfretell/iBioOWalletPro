<?php
function fechaCronograma($inicio, $frecuencia, $indice, $finMes=false) {
    $base = new DateTimeImmutable($inicio);
    if ($frecuencia === 'mensual') {
        $mes = $base->modify('first day of this month')->modify("+$indice months");
        return $mes->setDate((int)$mes->format('Y'), (int)$mes->format('m'), $finMes?(int)$mes->format('t'):min((int)$base->format('d'), (int)$mes->format('t')))->format('Y-m-d');
    }
    return $base->modify('+'.($indice * ($frecuencia==='semanal'?7:15)).' days')->format('Y-m-d');
}
function ampliarCronograma($pdo, $id) {
    $stmt=$pdo->prepare('SELECT * FROM deudas WHERE id=? FOR UPDATE');$stmt->execute([$id]);$d=$stmt->fetch();
    if (!$d || $d['modalidad']==='cuotas') return;
    $limite=$d['modalidad']==='fecha'?$d['fin']:(new DateTimeImmutable('last day of this month'))->modify('+12 months')->format('Y-m-t');
    $stmt=$pdo->prepare('SELECT fecha FROM deuda_cuotas WHERE deuda_id=?');$stmt->execute([$id]);$existentes=array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));
    $stmt=$pdo->prepare('SELECT COALESCE(MAX(numero),0) FROM deuda_cuotas WHERE deuda_id=?');$stmt->execute([$id]);$numero=(int)$stmt->fetchColumn();
    for($i=0;$i<16000;$i++) {
        $fecha=fechaCronograma($d['inicio'],$d['frecuencia'],$i,!empty($d['fin_mes']));
        if($fecha>$limite || $fecha>'2199-12-31')break;
        if(isset($existentes[$fecha]))continue;
        // Un vencimiento editado u omitido conserva su posición en el calendario original.
        $check=$pdo->prepare('SELECT id FROM deuda_cuotas WHERE deuda_id=? AND posicion=?');$check->execute([$id,$i]);if($check->fetch())continue;
        $importe=$d['importe'];
        foreach(json_decode($d['tarifas']??'[]',true)?:[] as $tarifa)if($fecha>=$tarifa['desde'])$importe=$tarifa['monto'];
        $pdo->prepare('INSERT INTO deuda_cuotas(deuda_id,numero,fecha,monto,posicion) VALUES(?,?,?,?,?)')->execute([$id,++$numero,$fecha,$importe,$i]);
    }
}
function sincronizarCronogramas($pdo) {
    $pdo->beginTransaction();
    try {foreach($pdo->query("SELECT id FROM deudas WHERE modalidad='continuo'")->fetchAll(PDO::FETCH_COLUMN) as $id)ampliarCronograma($pdo,$id);$pdo->commit();}
    catch(Throwable $e){$pdo->rollBack();throw $e;}
}
function configurarCronograma($pdo,$id,$data) {
    $modo=$data['modalidad']??'cuotas';
    if(!in_array($modo,['cuotas','fecha','continuo'],true))throw new InvalidArgumentException('Modalidad inválida.');
    $freq=$data['frecuencia']??'mensual';if(!in_array($freq,['mensual','semanal','quincenal'],true))throw new InvalidArgumentException('Frecuencia inválida.');
    $inicio=fechaValida($data['inicio']??null);$fin=$modo==='fecha'?fechaValida($data['fin']??null):null;
    if($fin && $fin<$inicio)throw new InvalidArgumentException('El término debe ser posterior al inicio.');
    $importe=dineroCentavos($data['importe']??'');if($importe<=0)throw new InvalidArgumentException('Indica un importe positivo.');
    $pdo->prepare('UPDATE deudas SET modalidad=?,frecuencia=?,inicio=?,fin=?,importe=? WHERE id=?')->execute([$modo,$freq,$inicio,$fin,decimalCentavos($importe),$id]);
    if($fin)$pdo->prepare('DELETE c FROM deuda_cuotas c WHERE c.deuda_id=? AND c.fecha>? AND NOT EXISTS(SELECT 1 FROM deuda_pagos p WHERE p.cuota_id=c.id)')->execute([$id,$fin]);
    $pdo->prepare('UPDATE deudas SET fin_mes=? WHERE id=?')->execute([!empty($data['fin_mes'])&&$freq==='mensual'?1:0,$id]);
    ampliarCronograma($pdo,$id);
}
