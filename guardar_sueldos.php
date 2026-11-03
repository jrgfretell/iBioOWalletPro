<?php
// guardar_sueldos.php
require_once 'conexion.php';

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['anio']) || (!isset($data['mes']) && !isset($data['meses'])) || !isset($data['s15']) || !isset($data['s30'])) {
    echo json_encode(["success" => false, "error" => "Datos incompletos"]);
    exit();
}

$anio = intval($data['anio']);
$s15 = floatval($data['s15']);
$s30 = floatval($data['s30']);

if ($s15 < 0 || $s30 < 0) {
    echo json_encode(["success" => false, "error" => "Los montos de sueldo no pueden ser negativos"]);
    exit();
}

$meses = [];
if (isset($data['meses']) && is_array($data['meses'])) {
    foreach ($data['meses'] as $m) {
        $mesInt = intval($m);
        if ($mesInt >= 0 && $mesInt <= 11) {
            $meses[] = $mesInt;
        }
    }
    $meses = array_values(array_unique($meses));
} elseif (isset($data['mes'])) {
    $mesInt = intval($data['mes']);
    if ($mesInt >= 0 && $mesInt <= 11) {
        $meses[] = $mesInt;
    }
}

if (empty($meses)) {
    echo json_encode(["success" => false, "error" => "Mes inválido"]);
    exit();
}

try {
    $pdo->beginTransaction();
    $query = "INSERT INTO sueldos_mes (anio, mes, sueldo_15, sueldo_30) 
              VALUES (:anio, :mes, :s15, :s30)
              ON DUPLICATE KEY UPDATE sueldo_15 = :s15_up, sueldo_30 = :s30_up";
              
    $stmt = $pdo->prepare($query);
    foreach ($meses as $mes) {
        $stmt->execute([
            ':anio'   => $anio,
            ':mes'    => $mes,
            ':s15'    => $s15,
            ':s30'    => $s30,
            ':s15_up' => $s15,
            ':s30_up' => $s30
        ]);
    }
    $pdo->commit();

    echo json_encode(["success" => true, "meses_actualizados" => count($meses)]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
