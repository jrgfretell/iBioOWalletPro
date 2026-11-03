$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.local\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No hay un servidor local registrado.'; exit }
$serverId = [int](Get-Content -LiteralPath $pidFile)
$server = Get-CimInstance Win32_Process -Filter "ProcessId = $serverId"
if ($server) {
    if ($server.ExecutablePath -ne 'C:\xampp\php\php.exe' -or $server.CommandLine -notlike '*127.0.0.1:8080*local/router.php*') {
        throw 'El PID pertenece a otro proceso. No se detuvo.'
    }
    $process = Get-Process -Id $serverId
    Stop-Process -Id $serverId
    $process.WaitForExit()
}
Remove-Item -LiteralPath $pidFile
Write-Host 'Servidor local detenido. MySQL sigue activo.'
