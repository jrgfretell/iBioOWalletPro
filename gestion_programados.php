<?php
header('Content-Type: application/json; charset=UTF-8');
require __DIR__ . '/conexion.php';
require __DIR__ . '/deudas_lib.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new RuntimeException('Usa POST.');
    $data = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    $action = $_GET['action'] ?? '';
    if (!in_array($action, ['confirmar', 'anular'], true)) throw new RuntimeException('Acción inválida.');
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT * FROM movimientos_agenda WHERE id=? AND es_recurrente=1 FOR UPDATE');
    $stmt->execute([(int)($data['id'] ?? 0)]);
    $mov = $stmt->fetch();
    if (!$mov) throw new RuntimeException('Movimiento recurrente no encontrado.');
    if ($action === 'confirmar') {
        $fecha = fechaValida($data['fecha'] ?? '');
        if ($fecha > date('Y-m-d')) throw new RuntimeException('La fecha real no puede ser futura.');
        if (!$mov['pago_confirmado']) {
            $pdo->prepare('UPDATE movimientos_agenda SET pago_confirmado=1, fecha_pago=? WHERE id=?')->execute([$fecha, $mov['id']]);
        } elseif ($mov['fecha_pago'] !== $fecha) {
            throw new RuntimeException('Este movimiento ya está confirmado. Actualiza la vista.');
        }
    } else {
        // Una fila antigua sin fecha de confirmación sigue siendo un histórico editable en Movimientos.
        if (!$mov['fecha_pago']) throw new RuntimeException('No hay una confirmación reciente para anular.');
        $pdo->prepare('UPDATE movimientos_agenda SET pago_confirmado=0, fecha_pago=NULL WHERE id=?')->execute([$mov['id']]);
    }
    $pdo->commit();
    echo json_encode(['success'=>true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['success'=>false, 'error'=>$e->getMessage()]);
}
