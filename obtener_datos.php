<?php
// obtener_datos.php
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

require_once 'conexion.php';
require_once __DIR__ . '/deudas_lib.php';

// Funciones auxiliares de sincronización
function obtenerPeriodosProyectadosLocal() {
    $periodos = [];
    $fecha = new DateTime('first day of this month');
    for ($i = 0; $i <= 12; $i++) {
        $anio = intval($fecha->format('Y'));
        $mesIdx = intval($fecha->format('n')) - 1; // 0 a 11
        $periodos[] = "{$anio}-{$mesIdx}";
        $fecha->modify('+1 month');
    }
    return $periodos;
}

function calcularFechaPeriodoLocal($periodo, $diaPago, $tipoRecurrencia = 'mensual') {
    $parts = explode('-', $periodo);
    $anio = intval($parts[0]);
    $mesReal = intval($parts[1]) + 1; // 1 a 12
    
    // Validar días máximos en este mes
    $fechaTemp = sprintf("%04d-%02d-01", $anio, $mesReal);
    $diasEnMes = intval(date('t', strtotime($fechaTemp)));
    
    $fechas = [];
    
    if ($tipoRecurrencia === 'semanal') {
        // semanal: diaPago es 1 (Lunes) a 7 (Domingo)
        $diaBuscado = intval($diaPago);
        for ($dia = 1; $dia <= $diasEnMes; $dia++) {
            $timestamp = strtotime(sprintf("%04d-%02d-%02d", $anio, $mesReal, $dia));
            $w = intval(date('N', $timestamp)); // 1 (Lunes) a 7 (Domingo)
            if ($w === $diaBuscado) {
                $fechas[] = sprintf("%04d-%02d-%02d", $anio, $mesReal, $dia);
            }
        }
    } else {
        // mensual: diaPago es del 1 al 31
        $dia = intval($diaPago);
        if ($dia > $diasEnMes) {
            $dia = $diasEnMes;
        }
        $fechas[] = sprintf("%04d-%02d-%02d", $anio, $mesReal, $dia);
    }
    
    return $fechas;
}

function insertarMovimientoAgendaLocal($pdo, $tipo, $desc, $monto, $fecha, $categoria_id, $es_recurrente = 0, $recurrenteId = null) {
    $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM movimientos_agenda WHERE recurrente_id = :recurrente_id AND fecha = :fecha");
    $stmtCheck->execute([':recurrente_id' => intval($recurrenteId), ':fecha' => $fecha]);
    if (intval($stmtCheck->fetchColumn()) > 0) {
        return; // Evitar duplicado
    }
    
    $stmt = $pdo->prepare("INSERT INTO movimientos_agenda (tipo, descripcion, monto, fecha, categoria_id, es_recurrente, recurrente_id, pago_confirmado) VALUES (:tipo, :desc, :monto, :fecha, :categoria_id, :es_recurrente, :recurrente_id, 0)");
    $stmt->execute([
        ':tipo' => $tipo,
        ':desc' => $desc,
        ':monto' => floatval($monto),
        ':fecha' => $fecha,
        ':categoria_id' => $categoria_id,
        ':es_recurrente' => intval($es_recurrente),
        ':recurrente_id' => intval($recurrenteId)
    ]);
}

try {
    // Migración automática de columna tipo_recurrencia si no existe
    $stmtCheckCol = $pdo->query("SHOW COLUMNS FROM `movimientos_recurrentes` LIKE 'tipo_recurrencia'");
    if (!$stmtCheckCol->fetch()) {
        $pdo->exec("ALTER TABLE `movimientos_recurrentes` ADD COLUMN `tipo_recurrencia` VARCHAR(15) DEFAULT 'mensual'");
    }

    // Migración automática de columna es_recurrente en movimientos_agenda si no existe
    $stmtCheckColAgenda = $pdo->query("SHOW COLUMNS FROM `movimientos_agenda` LIKE 'es_recurrente'");
    if (!$stmtCheckColAgenda->fetch()) {
        $pdo->exec("ALTER TABLE `movimientos_agenda` ADD COLUMN `es_recurrente` TINYINT(1) DEFAULT 0");
        // Retro-inicializar: marcar como recurrentes los movimientos que coincidan con la descripción de recurrentes
        $pdo->exec("UPDATE `movimientos_agenda` m 
                    SET m.es_recurrente = 1 
                    WHERE LOWER(TRIM(m.descripcion)) IN (SELECT DISTINCT LOWER(TRIM(r.descripcion)) FROM `movimientos_recurrentes` r)");
    }

    // Rutina de Auto-Sincronización de Movimientos Fijos a la Agenda (Auto-Sanación)
    $primerDiaMesActual = date('Y-m-01');
    $periodosProyectados = obtenerPeriodosProyectadosLocal();
    
    // Obtener todos los recurrentes
    $stmtRecs = $pdo->query("SELECT id, tipo, descripcion, monto, dia_pago, categoria_id, periodos, tipo_recurrencia FROM movimientos_recurrentes WHERE cronograma_id IS NULL");
    $recurrentes = $stmtRecs->fetchAll();
    
    if (!empty($recurrentes)) {
        foreach ($recurrentes as $rec) {
            $periodosAplica = !empty($rec['periodos']) ? explode(',', $rec['periodos']) : $periodosProyectados;
            foreach ($periodosAplica as $p) {
                $fechasPago = calcularFechaPeriodoLocal($p, $rec['dia_pago'], isset($rec['tipo_recurrencia']) ? $rec['tipo_recurrencia'] : 'mensual');
                foreach ($fechasPago as $fechaPago) {
                    // Solo auto-sincronizar meses futuros y actual
                    if ($fechaPago >= $primerDiaMesActual) {
                        insertarMovimientoAgendaLocal(
                            $pdo, 
                            $rec['tipo'], 
                            $rec['descripcion'], 
                            $rec['monto'], 
                            $fechaPago, 
                            $rec['categoria_id'] !== null ? intval($rec['categoria_id']) : null,
                            1,
                            intval($rec['id'])
                        );
                    }
                }
            }
        }
    }
    // 1. Obtener monto base
    $stmtConfig = $pdo->query("SELECT monto_base,fecha_referencia,movimientos_incluidos FROM config_billetera WHERE id = 1");
    $config = $stmtConfig->fetch();
    $montoBase = $config ? floatval($config['monto_base']) : 0.00;

    // 2. Obtener todos los sueldos personalizados por mes
    $stmtSueldos = $pdo->query("SELECT anio, mes, sueldo_15, sueldo_30 FROM sueldos_mes");
    $sueldosPorMes = [];
    while ($row = $stmtSueldos->fetch()) {
        $llave = $row['anio'] . "-" . $row['mes'];
        $sueldosPorMes[$llave] = [
            "s15" => floatval($row['sueldo_15']),
            "s30" => floatval($row['sueldo_30'])
        ];
    }

    // 3. Obtener categorías
    $categorias = [];
    try {
        $stmtCats = $pdo->query("SELECT id, nombre, color, icono FROM categorias ORDER BY nombre ASC");
        while ($row = $stmtCats->fetch()) {
            $row['id'] = intval($row['id']);
            $categorias[] = $row;
        }
    } catch (PDOException $e) {
        $categorias = [];
    }

    // 4. Obtener todos los movimientos de la agenda ordenados por fecha
    $stmtMovs = $pdo->query("SELECT m.id, m.tipo, m.descripcion, CAST(m.monto AS DECIMAL(10,2)) as monto, m.fecha, m.categoria_id, m.es_recurrente, m.recurrente_id, m.pago_confirmado, m.fecha_pago, p.cuota_id, q.deuda_id, d.modalidad AS cronograma_modalidad, c.nombre as categoria_nombre, c.color as categoria_color, c.icono as categoria_icono
                             FROM movimientos_agenda m 
                             LEFT JOIN deuda_pagos p ON p.movimiento_id=m.id
                             LEFT JOIN deuda_cuotas q ON q.id=p.cuota_id
                             LEFT JOIN deudas d ON d.id=q.deuda_id
                             LEFT JOIN categorias c ON m.categoria_id = c.id 
                             ORDER BY m.fecha ASC");
    $movimientos = [];
    $programadosRecurrentes = [];
    $proyeccionesRecurrentes = [];
    while ($row = $stmtMovs->fetch()) {
        $row['id'] = intval($row['id']);
        $row['monto'] = floatval($row['monto']);
        $row['categoria_id'] = $row['categoria_id'] !== null ? intval($row['categoria_id']) : null;
        $row['es_recurrente'] = intval($row['es_recurrente']) > 0;
        $row['recurrente_id'] = $row['recurrente_id'] !== null ? intval($row['recurrente_id']) : null;
        $row['cuota_id'] = $row['cuota_id'] !== null ? intval($row['cuota_id']) : null;
        $row['deuda_id'] = $row['deuda_id'] !== null ? intval($row['deuda_id']) : null;
        if ($row['es_recurrente']) {
            $programadosRecurrentes[] = $row;
            if (!$row['pago_confirmado']) {
                $row['fecha'] = max($row['fecha'], date('Y-m-d'));
                $row['descripcion'] .= ' (pendiente)';
                $proyeccionesRecurrentes[] = $row;
                continue;
            }
            $row['fecha'] = $row['fecha_pago'] ?: $row['fecha'];
        }
        $movimientos[] = $row;
    }

    // 5. Obtener todos los movimientos recurrentes
    $recurrentes = [];
    try {
        $stmtRecurrentes = $pdo->query("SELECT r.id, r.tipo, r.descripcion, CAST(r.monto AS DECIMAL(10,2)) as monto, r.dia_pago, r.categoria_id, r.periodos, r.tipo_recurrencia, c.nombre as categoria_nombre, c.color as categoria_color, c.icono as categoria_icono 
                                        FROM movimientos_recurrentes r 
                                        LEFT JOIN categorias c ON r.categoria_id = c.id 
                                        WHERE r.cronograma_id IS NULL ORDER BY r.dia_pago ASC");
        while ($row = $stmtRecurrentes->fetch()) {
            $row['id'] = intval($row['id']);
            $row['monto'] = floatval($row['monto']);
            $row['dia_pago'] = intval($row['dia_pago']);
            $row['categoria_id'] = $row['categoria_id'] !== null ? intval($row['categoria_id']) : null;
            $row['periodos'] = $row['periodos']; // Se mantiene como cadena o nulo
            $row['tipo_recurrencia'] = $row['tipo_recurrencia'] ?? 'mensual';
            $recurrentes[] = $row;
        }
    } catch (PDOException $e) {
        $recurrentes = [];
    }

    $cronogramas = obtenerDeudas($pdo);
    $proyeccionesCuotas = [];
    foreach ($cronogramas['pendientes'] as $cuota) {
        $proyeccionesCuotas[] = [
            'id'=>'cuota-' . $cuota['id'], 'tipo'=>'gasto',
            'descripcion'=>$cuota['nombre'] . ' · Cuota ' . $cuota['numero'] . '/' . $cuota['total_cuotas'] . ' (pendiente)',
            'monto'=>(float)$cuota['pendiente'],
            'fecha'=>max($cuota['fecha'], date('Y-m-d')),
            'categoria_nombre'=>'Cuotas pendientes', 'categoria_color'=>'#d99829', 'categoria_icono'=>'fa-calendar-check'
        ];
    }
    // Los compromisos se exponen aparte de los gastos realizados.
    echo json_encode([
        "success" => true,
        "montoBase" => $montoBase,
        "fechaReferencia" => $config ? $config['fecha_referencia'] : null,
        "movimientosIncluidos" => $config ? (json_decode($config['movimientos_incluidos'] ?? '[]',true) ?: []) : [],
        "sueldosPorMes" => $sueldosPorMes,
        "categorias" => $categorias,
        "movimientos" => $movimientos,
        "recurrentes" => $recurrentes,
        "programadosRecurrentes" => $programadosRecurrentes,
        "proyeccionesRecurrentes" => $proyeccionesRecurrentes,
        "cuotasPendientes" => $cronogramas['pendientes'],
        "proyeccionesCuotas" => $proyeccionesCuotas
    ]);

} catch (PDOException $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
