<?php
require_once __DIR__ . "/cronogramas_lib.php";
function dineroCentavos($value) {
    if (!is_scalar($value) || !preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D', (string)$value)) {
        throw new InvalidArgumentException('Ingresa un monto válido, con hasta dos decimales.');
    }
    $parts = explode('.', (string)$value);
    return ((int)$parts[0] * 100) + (int)str_pad($parts[1] ?? '', 2, '0');
}
function decimalCentavos($value) { return sprintf('%d.%02d', intdiv($value, 100), $value % 100); }
function fechaValida($value) {
    $date = is_string($value) ? DateTimeImmutable::createFromFormat('!Y-m-d', $value) : false;
    if (!$date || $date->format('Y-m-d') !== $value || $value < '1900-01-01' || $value > '2199-12-31') {
        throw new InvalidArgumentException('La fecha debe estar entre 1900 y 2199 y ser válida.');
    }
    return $value;
}
function registrarPagoCuota($pdo, $cuotaId, $monto, $fecha, $solicitud) {
    $centavos = dineroCentavos($monto);
    $fecha = fechaValida($fecha);
    if ($fecha > date('Y-m-d')) throw new InvalidArgumentException('Un pago realizado no puede tener fecha futura.');
    if ($centavos <= 0) throw new InvalidArgumentException('El pago debe ser mayor que cero.');
    if (!is_string($solicitud) || !preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $solicitud)) throw new InvalidArgumentException('Identificador de pago inválido.');
    $stmt = $pdo->prepare('SELECT c.*, d.nombre, d.categoria_id FROM deuda_cuotas c JOIN deudas d ON d.id=c.deuda_id WHERE c.id=? FOR UPDATE');
    $stmt->execute([$cuotaId]);
    $cuota = $stmt->fetch();
    if ($cuota && $cuota['omitida']) throw new InvalidArgumentException('Este vencimiento está omitido.');
    if (!$cuota) throw new InvalidArgumentException('Cuota no encontrada.');
    $stmt = $pdo->prepare('SELECT * FROM deuda_pagos WHERE solicitud=?');
    $stmt->execute([$solicitud]);
    if ($old = $stmt->fetch()) {
        if ((int)$old['cuota_id'] !== (int)$cuotaId || dineroCentavos($old['monto']) !== $centavos || $old['fecha'] !== $fecha) {
            throw new InvalidArgumentException('La solicitud ya se utilizó para otro pago.');
        }
        return (int)$old['id'];
    }
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto),0) FROM deuda_pagos WHERE cuota_id=?');
    $stmt->execute([$cuotaId]);
    $pagado = dineroCentavos($stmt->fetchColumn());
    if ($centavos > dineroCentavos($cuota['monto']) - $pagado) throw new InvalidArgumentException('El pago supera el saldo pendiente de la cuota.');
    $stmt = $pdo->prepare("INSERT INTO movimientos_agenda(tipo,descripcion,monto,fecha,categoria_id,es_recurrente) VALUES('gasto',?,?,?,?,0)");
    $stmt->execute([mb_substr($cuota['nombre'] . ' · Cuota ' . $cuota['numero'], 0, 255), decimalCentavos($centavos), $fecha, $cuota['categoria_id']]);
    $movId = $pdo->lastInsertId();
    $stmt = $pdo->prepare('INSERT INTO deuda_pagos(cuota_id,movimiento_id,monto,fecha,solicitud) VALUES(?,?,?,?,?)');
    $stmt->execute([$cuotaId, $movId, decimalCentavos($centavos), $fecha, $solicitud]);
    return (int)$pdo->lastInsertId();
}
function obtenerDeudas($pdo) {
    sincronizarCronogramas($pdo);
    $deudas = $pdo->query('SELECT d.*, c.nombre AS categoria_nombre FROM deudas d LEFT JOIN categorias c ON c.id=d.categoria_id ORDER BY d.id DESC')->fetchAll();
    $cuotas = $pdo->query('SELECT * FROM deuda_cuotas ORDER BY numero,id')->fetchAll();
    $pagos = $pdo->query('SELECT id,cuota_id,movimiento_id,monto,fecha FROM deuda_pagos ORDER BY fecha,id')->fetchAll();
    $porCuota = []; $porDeuda = []; $pendientes = [];
    foreach ($pagos as $pago) {
        foreach (['id','cuota_id','movimiento_id'] as $key) $pago[$key] = (int)$pago[$key];
        $porCuota[$pago['cuota_id']][] = $pago;
    }
    foreach ($cuotas as $cuota) {
        foreach (['id','deuda_id','numero'] as $key) $cuota[$key] = (int)$cuota[$key];
        $cuota['pagos'] = $porCuota[$cuota['id']] ?? [];
        $pagado = array_sum(array_map(fn($p) => dineroCentavos($p['monto']), $cuota['pagos']));
        $saldo = dineroCentavos($cuota['monto']) - $pagado;
        $cuota['pagado'] = decimalCentavos($pagado);
        $cuota['pendiente'] = $cuota['omitida'] ? '0.00' : decimalCentavos($saldo);
        $cuota['estado'] = $cuota['omitida'] ? 'omitida' : ($saldo === 0 ? 'pagada' : ($cuota['fecha'] < date('Y-m-d') ? 'vencida' : ($pagado > 0 ? 'parcial' : 'pendiente')));
        $porDeuda[$cuota['deuda_id']][] = $cuota;
    }
    foreach ($deudas as &$deuda) {
        $deuda['id'] = (int)$deuda['id'];
        $deuda['cuotas'] = $porDeuda[$deuda['id']] ?? [];
        $total = 0; $pagado = 0; $completas = 0;
        foreach ($deuda['cuotas'] as $cuota) {
            if($cuota['omitida'])continue;
            $total += dineroCentavos($cuota['monto']);
            $pagado += dineroCentavos($cuota['pagado']);
            if ($cuota['estado'] === 'pagada') $completas++;
            else $pendientes[] = ['id'=>$cuota['id'], 'deuda_id'=>$deuda['id'], 'nombre'=>$deuda['nombre'], 'numero'=>$cuota['numero'], 'total_cuotas'=>count($deuda['cuotas']), 'fecha'=>$cuota['fecha'], 'pendiente'=>$cuota['pendiente'], 'estado'=>$cuota['estado'], 'modalidad'=>$deuda['modalidad']];
        }
        $deuda['total'] = decimalCentavos($total);
        $deuda['pagado'] = decimalCentavos($pagado);
        $deuda['pendiente'] = decimalCentavos($total-$pagado);
        $deuda['cuotas_pagadas'] = $completas;
    }
    unset($deuda);
    usort($pendientes, fn($a,$b) => [$a['fecha'],$a['id']] <=> [$b['fecha'],$b['id']]);
    return ['deudas'=>$deudas, 'pendientes'=>$pendientes];
}
