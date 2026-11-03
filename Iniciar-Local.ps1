param([switch]$SinNavegador)
$ErrorActionPreference = 'Stop'
$php = 'C:\xampp\php\php.exe'
if (-not (Test-Path -LiteralPath $php)) { throw "No se encontró PHP en $php" }
$url = 'http://127.0.0.1:8080'
$stateDir = Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 }
if ($listener) {
    $pidFile = Join-Path $stateDir 'server.pid'
    if (-not (Test-Path -LiteralPath $pidFile) -or [int](Get-Content -LiteralPath $pidFile) -notin $listener.OwningProcess) {
        throw 'El puerto 8080 está ocupado por otro proceso.'
    }
} else {
    $server = Start-Process -FilePath $php -ArgumentList @('-d', 'date.timezone=America/Lima', '-S', '127.0.0.1:8080', '-t', '.', 'local/router.php') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'server.out.log') -RedirectStandardError (Join-Path $stateDir 'server.err.log') -PassThru
    Set-Content -LiteralPath (Join-Path $stateDir 'server.pid') -Value $server.Id
}
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $data = Invoke-RestMethod -Uri "$url/obtener_datos.php" -TimeoutSec 3
        if (-not $data.success) { throw 'MySQL no respondió correctamente.' }
        $ready = $true
        break
    } catch { Start-Sleep -Milliseconds 300 }
}
if (-not $ready) { throw 'La aplicación no respondió. Revisa .local/server.err.log y el servicio MySQL.' }
Write-Host "Aplicación lista: $url"
if (-not $SinNavegador) { Start-Process $url }
