<?php
// gestion_movimientos.php
require_once 'conexion.php';
require_once __DIR__ . '/deudas_lib.php';

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents("php://input"), true);

function obtenerPeriodosProyectados() {
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

function calcularFechaPeriodo($periodo, $diaPago, $tipoRecurrencia = 'mensual') {
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

function insertarMovimientoAgenda($pdo, $tipo, $desc, $monto, $fecha, $categoria_id, $es_recurrente = 0, $recurrente_id = null) {
    if ($recurrente_id !== null) {
        $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM movimientos_agenda WHERE recurrente_id = :recurrente_id AND fecha = :fecha");
        $stmtCheck->execute([':recurrente_id' => intval($recurrente_id), ':fecha' => $fecha]);
        if (intval($stmtCheck->fetchColumn()) > 0) return;
    }
    
    $stmt = $pdo->prepare("INSERT INTO movimientos_agenda (tipo, descripcion, monto, fecha, categoria_id, es_recurrente, recurrente_id, pago_confirmado) VALUES (:tipo, :desc, :monto, :fecha, :categoria_id, :es_recurrente, :recurrente_id, 0)");
    $stmt->execute([
        ':tipo' => $tipo,
        ':desc' => $desc,
        ':monto' => floatval($monto),
        ':fecha' => $fecha,
        ':categoria_id' => $categoria_id,
        ':es_recurrente' => intval($es_recurrente),
        ':recurrente_id' => $recurrente_id !== null ? intval($recurrente_id) : null
    ]);
}

try {
    switch ($action) {
        case 'ajustar_base':
            if (!isset($data['monto_base'])) throw new Exception("Monto base requerido");
            $monto=dineroCentavos($data['monto_base']);
            if (array_key_exists('fecha_referencia',$data)) {
                $fecha=$data['fecha_referencia']===null?null:fechaValida($data['fecha_referencia']);
                if($fecha && $fecha>date('Y-m-d'))throw new Exception('El saldo real no puede tener fecha futura.');
                $pdo->beginTransaction();
                $incluidos=[];
                if($fecha){
                    $stmt=$pdo->prepare('SELECT id FROM movimientos_agenda WHERE pago_confirmado=1 AND COALESCE(fecha_pago,fecha)<=?');
                    $stmt->execute([$fecha]);$incluidos=$stmt->fetchAll(PDO::FETCH_COLUMN);
                }
                $pdo->prepare('INSERT INTO config_billetera(id,monto_base,fecha_referencia,movimientos_incluidos) VALUES(1,?,?,?) ON DUPLICATE KEY UPDATE monto_base=VALUES(monto_base),fecha_referencia=VALUES(fecha_referencia),movimientos_incluidos=VALUES(movimientos_incluidos)')->execute([decimalCentavos($monto),$fecha,json_encode($incluidos)]);
                $pdo->commit();
                echo json_encode(['success'=>true]);break;
            }
            $stmt = $pdo->prepare("INSERT INTO config_billetera (id, monto_base) VALUES (1, :monto) ON DUPLICATE KEY UPDATE monto_base = VALUES(monto_base)");
            $stmt->execute([':monto' => floatval($data['monto_base'])]);
            echo json_encode(["success" => true]);
            break;

        case 'guardar': // Crea o Edita un movimiento de la agenda
            if (empty($data['tipo']) || empty($data['descripcion']) || !isset($data['monto']) || empty($data['fecha'])) {
                throw new Exception("Campos obligatorios incompletos");
            }
            if (fechaValida($data['fecha']) > date('Y-m-d')) throw new Exception('Registra aquí operaciones realizadas hasta hoy. Para fechas futuras usa Pagos programados.');
            if (!in_array($data['tipo'],['gasto','ingreso'],true) || dineroCentavos($data['monto'])<=0 || trim($data['descripcion'])==='') throw new Exception('Indica tipo, descripción y monto positivo válidos.');
            
            $categoria_id = (!empty($data['categoria_id'])) ? intval($data['categoria_id']) : null;
            
            if (!empty($data['id'])) {
                $checkPago = $pdo->prepare('SELECT id FROM deuda_pagos WHERE movimiento_id=?');
                $checkPago->execute([intval($data['id'])]);
                if ($checkPago->fetch()) throw new Exception('Este gasto corresponde a una cuota. Administra su pago en Pagos programados.');
            $confirmed = $pdo->prepare('SELECT id FROM movimientos_agenda WHERE id=? AND es_recurrente=1 AND fecha_pago IS NOT NULL');
            $confirmed->execute([(int)$data['id']]);
            if ($confirmed->fetch()) throw new Exception('Anula la confirmación en Pagos programados antes de cambiar este pago.');
                // Modo EDICIÓN
                $stmt = $pdo->prepare("UPDATE movimientos_agenda SET tipo = :tipo, descripcion = :desc, monto = :monto, fecha = :fecha, categoria_id = :cat_id WHERE id = :id");
                $stmt->execute([
                    ':tipo' => $data['tipo'],
                    ':desc' => $data['descripcion'],
                    ':monto'=> floatval($data['monto']),
                    ':fecha'=> $data['fecha'],
                    ':cat_id'=> $categoria_id,
                    ':id'   => intval($data['id'])
                ]);
            } else {
                // Modo NUEVO REGISTRO (es_recurrente = 0 por ser manual)
                $stmt = $pdo->prepare("INSERT INTO movimientos_agenda (tipo, descripcion, monto, fecha, categoria_id, es_recurrente) VALUES (:tipo, :desc, :monto, :fecha, :cat_id, 0)");
                $stmt->execute([
                    ':tipo' => $data['tipo'],
                    ':desc' => $data['descripcion'],
                    ':monto'=> floatval($data['monto']),
                    ':fecha'=> $data['fecha'],
                    ':cat_id'=> $categoria_id
                ]);
            }
            echo json_encode(["success" => true]);
            break;

        case 'eliminar':
            if (!isset($data['id'])) throw new Exception("ID requerido");
            $checkPago = $pdo->prepare('SELECT id FROM deuda_pagos WHERE movimiento_id=?');
            $checkPago->execute([intval($data['id'])]);
            if ($checkPago->fetch()) throw new Exception('Anula este pago desde Pagos programados para actualizar el saldo pendiente.');
            $confirmed = $pdo->prepare('SELECT id FROM movimientos_agenda WHERE id=? AND es_recurrente=1 AND fecha_pago IS NOT NULL');
            $confirmed->execute([(int)$data['id']]);
            if ($confirmed->fetch()) throw new Exception('Anula la confirmación en Pagos programados antes de cambiar este pago.');
            $stmt = $pdo->prepare("DELETE FROM movimientos_agenda WHERE id = :id");
            $stmt->execute([':id' => intval($data['id'])]);
            echo json_encode(["success" => true]);
            break;

        case 'borrar_todo':
            // Borrar únicamente los movimientos ocasionales o manuales (es_recurrente = 0)
            $pdo->query("DELETE FROM movimientos_agenda WHERE es_recurrente = 0 AND NOT EXISTS (SELECT 1 FROM deuda_pagos p WHERE p.movimiento_id=movimientos_agenda.id)");
            echo json_encode(["success" => true]);
            break;

        case 'guardar_recurrente':
            if(($data['tipo']??'gasto')==='gasto')throw new Exception('Registra los pagos desde Cronogramas.'); // Crea o Edita un movimiento recurrente
            if (empty($data['tipo']) || empty($data['descripcion']) || !isset($data['monto']) || !isset($data['dia_pago'])) {
                throw new Exception("Campos obligatorios de recurrente incompletos");
            }
            
            if (!in_array($data['tipo'], ['gasto','ingreso'], true) || dineroCentavos($data['monto']) <= 0 || trim($data['descripcion']) === '') {
                throw new Exception('Indica tipo, descripción e importe positivo válidos.');
            }
            $frecuencia = $data['tipo_recurrencia'] ?? 'mensual';
            $dia = filter_var($data['dia_pago'], FILTER_VALIDATE_INT);
            if (!in_array($frecuencia, ['mensual','semanal'], true) || !$dia || $dia < 1 || $dia > ($frecuencia === 'semanal' ? 7 : 31)) {
                throw new Exception('Frecuencia o día de pago inválidos.');
            }
            if (!empty($data['periodos'])) foreach (explode(',', $data['periodos']) as $periodo) {
                if (!preg_match('/^(19|20|21)\d{2}-(?:[0-9]|10|11)$/D', $periodo)) throw new Exception('Mes de aplicación inválido.');
            }
            $pdo->beginTransaction();
            $categoria_id = (!empty($data['categoria_id'])) ? intval($data['categoria_id']) : null;
            $periodos = (!empty($data['periodos'])) ? trim($data['periodos']) : null;
            $tipo_recurrencia = (!empty($data['tipo_recurrencia'])) ? trim($data['tipo_recurrencia']) : 'mensual';
            $primerDiaMesActual = date('Y-m-01');
            
            if (!empty($data['id'])) {
                $recurrenteId = intval($data['id']);
                // Modo EDICIÓN: Obtener datos anteriores
                $stmtOld = $pdo->prepare("SELECT descripcion, dia_pago, periodos, tipo_recurrencia FROM movimientos_recurrentes WHERE id = :id");
                $stmtOld->execute([':id' => intval($data['id'])]);
                $recActual = $stmtOld->fetch();
                
                if (!$recActual) {
                    throw new Exception("Movimiento recurrente no encontrado.");
                }
                
                $recActual['tipo_recurrencia'] = $recActual['tipo_recurrencia'] ?? 'mensual';

                // Actualizar en la Plantilla de recurrentes
                $stmt = $pdo->prepare("UPDATE movimientos_recurrentes SET tipo = :tipo, descripcion = :desc, monto = :monto, dia_pago = :dia, categoria_id = :cat_id, periodos = :periodos, tipo_recurrencia = :tipo_rec WHERE id = :id");
                $stmt->execute([
                    ':tipo' => $data['tipo'],
                    ':desc' => $data['descripcion'],
                    ':monto'=> floatval($data['monto']),
                    ':dia'  => intval($data['dia_pago']),
                    ':cat_id'=> $categoria_id,
                    ':periodos'=> $periodos,
                    ':tipo_rec'=> $tipo_recurrencia,
                    ':id'   => $recurrenteId
                ]);

                // Propagar cambios a la Agenda en base a diferencias de periodos
                $periodosAntiguos = !empty($recActual['periodos']) ? explode(',', $recActual['periodos']) : obtenerPeriodosProyectados();
                $periodosNuevos = !empty($periodos) ? explode(',', $periodos) : obtenerPeriodosProyectados();

                $periodosEliminados = array_diff($periodosAntiguos, $periodosNuevos);
                $periodosAgregados = array_diff($periodosNuevos, $periodosAntiguos);
                $periodosMantenidos = array_intersect($periodosAntiguos, $periodosNuevos);

                // 1. Eliminar movimientos en periodos que ya no aplican (solo futuros/actual)
                foreach ($periodosEliminados as $p) {
                    $fechasOld = calcularFechaPeriodo($p, $recActual['dia_pago'], $recActual['tipo_recurrencia']);
                    foreach ($fechasOld as $fechaOld) {
                        if ($fechaOld >= $primerDiaMesActual) {
                            $stmtDel = $pdo->prepare("DELETE FROM movimientos_agenda WHERE pago_confirmado=0 AND recurrente_id = :recurrente_id AND fecha = :fecha");
                            $stmtDel->execute([':recurrente_id' => $recurrenteId, ':fecha' => $fechaOld]);
                        }
                    }
                }

                // 2. Insertar movimientos en nuevos periodos agregados (solo futuros/actual)
                foreach ($periodosAgregados as $p) {
                    $fechasNew = calcularFechaPeriodo($p, $data['dia_pago'], $tipo_recurrencia);
                    foreach ($fechasNew as $fechaNew) {
                        if ($fechaNew >= $primerDiaMesActual) {
                            insertarMovimientoAgenda($pdo, $data['tipo'], $data['descripcion'], $data['monto'], $fechaNew, $categoria_id, 1, $recurrenteId);
                        }
                    }
                }

                // 3. Limpiar e Insertar en periodos mantenidos (solo futuros/actual)
                // Esto maneja de forma limpia los cambios de recurrencia (mensual a semanal) y cambios de descripciones/montos
                foreach ($periodosMantenidos as $p) {
                    // Obtener fechas anteriores
                    $fechasOld = calcularFechaPeriodo($p, $recActual['dia_pago'], $recActual['tipo_recurrencia']);
                    // Borrar transacciones del recurrente de ese periodo (solo futuro/actual)
                    foreach ($fechasOld as $fechaOld) {
                        if ($fechaOld >= $primerDiaMesActual) {
                            $stmtDel = $pdo->prepare("DELETE FROM movimientos_agenda WHERE pago_confirmado=0 AND recurrente_id = :recurrente_id AND fecha = :fecha");
                            $stmtDel->execute([':recurrente_id' => $recurrenteId, ':fecha' => $fechaOld]);
                        }
                    }
                    
                    // Insertar nuevas fechas
                    $fechasNew = calcularFechaPeriodo($p, $data['dia_pago'], $tipo_recurrencia);
                    foreach ($fechasNew as $fechaNew) {
                        if ($fechaNew >= $primerDiaMesActual) {
                            insertarMovimientoAgenda($pdo, $data['tipo'], $data['descripcion'], $data['monto'], $fechaNew, $categoria_id, 1, $recurrenteId);
                        }
                    }
                }
            } else {
                // Modo NUEVO REGISTRO
                $stmt = $pdo->prepare("INSERT INTO movimientos_recurrentes (tipo, descripcion, monto, dia_pago, categoria_id, periodos, tipo_recurrencia) VALUES (:tipo, :desc, :monto, :dia, :cat_id, :periodos, :tipo_rec)");
                $stmt->execute([
                    ':tipo' => $data['tipo'],
                    ':desc' => $data['descripcion'],
                    ':monto'=> floatval($data['monto']),
                    ':dia'  => intval($data['dia_pago']),
                    ':cat_id'=> $categoria_id,
                    ':periodos'=> $periodos,
                    ':tipo_rec'=> $tipo_recurrencia
                ]);
                $recurrenteId = intval($pdo->lastInsertId());

                // Replicar en la Agenda para los periodos seleccionados (solo futuros/actual)
                $periodosNuevos = !empty($periodos) ? explode(',', $periodos) : obtenerPeriodosProyectados();
                foreach ($periodosNuevos as $p) {
                    $fechas = calcularFechaPeriodo($p, $data['dia_pago'], $tipo_recurrencia);
                    foreach ($fechas as $fecha) {
                        if ($fecha >= $primerDiaMesActual) {
                            insertarMovimientoAgenda($pdo, $data['tipo'], $data['descripcion'], $data['monto'], $fecha, $categoria_id, 1, $recurrenteId);
                        }
                    }
                }
            }
            $pdo->commit();
            echo json_encode(["success" => true]);
            break;

        case 'eliminar_recurrente':
            if (!isset($data['id'])) throw new Exception("ID requerido");
            $recurrenteId = intval($data['id']);
            $pdo->beginTransaction();
           
            $primerDiaMesActual = date('Y-m-01');
            $stmtDelMovs = $pdo->prepare("DELETE FROM movimientos_agenda WHERE pago_confirmado=0 AND recurrente_id = :recurrente_id AND fecha >= :fecha_limite");
            $stmtDelMovs->execute([':recurrente_id' => $recurrenteId, ':fecha_limite' => $primerDiaMesActual]);
            $stmt = $pdo->prepare("DELETE FROM movimientos_recurrentes WHERE id = :id");
            $stmt->execute([':id' => $recurrenteId]);
            $pdo->commit();
            echo json_encode(["success" => true]);
            break;

        case 'borrar_todo_recurrentes':
            $pdo->beginTransaction();
            $primerDiaMesActual = date('Y-m-01');
            $pdo->prepare("DELETE FROM movimientos_agenda WHERE pago_confirmado=0 AND recurrente_id IS NOT NULL AND fecha >= :fecha_limite")
                ->execute([':fecha_limite' => $primerDiaMesActual]);
            $pdo->query("DELETE FROM movimientos_recurrentes WHERE cronograma_id IS NULL");
            $pdo->commit();
            echo json_encode(["success" => true]);
            break;

        case 'clonar_recurrentes_mes':
            if (!isset($data['anio']) || !isset($data['mes'])) {
                throw new Exception("Año y mes requeridos para clonar");
            }
            $anio = intval($data['anio']);
            $mes = intval($data['mes']); // 0 a 11
            $mes_real = $mes + 1; // 1 a 12
            if ($anio < 1 || $anio > 9999 || $mes < 0 || $mes > 11) {
                throw new Exception('Mes o año inválido.');
            }

            // Obtener todos los recurrentes
            $stmtRecs = $pdo->query("SELECT id, tipo, descripcion, monto, dia_pago, categoria_id, periodos, tipo_recurrencia FROM movimientos_recurrentes WHERE cronograma_id IS NULL");
            $recurrentes = $stmtRecs->fetchAll();

            if (empty($recurrentes)) {
                echo json_encode(["success" => true, "clonados" => 0, "message" => "No hay movimientos fijos en la plantilla."]);
                break;
            }

            // Iniciar transacción para insertar todos
            $pdo->beginTransaction();
            
            // Preparar validador de duplicados
            $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM movimientos_agenda WHERE recurrente_id = :id AND fecha = :fecha");
            
            $insertados = 0;
            $periodo_a_buscar = "{$anio}-{$mes}"; // ej: 2026-6 para Julio (JS 6)

            foreach ($recurrentes as $rec) {
                // Verificar si este recurrente aplica para este periodo en específico
                $aplica = true;
                if (!empty($rec['periodos'])) {
                    $periodos_list = explode(",", $rec['periodos']);
                    if (!in_array($periodo_a_buscar, $periodos_list)) {
                        $aplica = false;
                    }
                }

                if (!$aplica) {
                    continue;
                }

                $fechas = calcularFechaPeriodo($periodo_a_buscar, $rec['dia_pago'], $rec['tipo_recurrencia'] ?? 'mensual');
                foreach ($fechas as $fecha) {
                    $stmtCheck->execute([':id' => $rec['id'], ':fecha' => $fecha]);
                    if (intval($stmtCheck->fetchColumn()) > 0) continue;
                    insertarMovimientoAgenda($pdo, $rec['tipo'], $rec['descripcion'], $rec['monto'], $fecha,
                        $rec['categoria_id'], 1, intval($rec['id']));
                    $insertados++;
                }
            }
            $pdo->commit();

            $msg = $insertados === 0 ? "Los movimientos fijos de este mes ya se encuentran cargados en la agenda. Se ignoraron para evitar duplicidad." : null;
            echo json_encode(["success" => true, "clonados" => $insertados, "message" => $msg]);
            break;

        case 'guardar_categoria': // Crea o Edita una categoría
            if (empty($data['nombre']) || empty($data['color']) || empty($data['icono'])) {
                throw new Exception("Campos obligatorios de categoría incompletos");
            }
            
            if (!empty($data['id'])) {
                // Modo EDICIÓN
                $stmt = $pdo->prepare("UPDATE categorias SET nombre = :nombre, color = :color, icono = :icono WHERE id = :id");
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':color'  => $data['color'],
                    ':icono'  => $data['icono'],
                    ':id'     => intval($data['id'])
                ]);
            } else {
                // Modo NUEVO REGISTRO
                $stmt = $pdo->prepare("INSERT INTO categorias (nombre, color, icono) VALUES (:nombre, :color, :icono)");
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':color'  => $data['color'],
                    ':icono'  => $data['icono']
                ]);
            }
            echo json_encode(["success" => true]);
            break;

        case 'eliminar_categoria':
            if (!isset($data['id'])) throw new Exception("ID de categoría requerido");
            $stmt = $pdo->prepare("DELETE FROM categorias WHERE id = :id");
            $stmt->execute([':id' => intval($data['id'])]);
            echo json_encode(["success" => true]);
            break;

        default:
            echo json_encode(["success" => false, "error" => "Acción no válida"]);
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
