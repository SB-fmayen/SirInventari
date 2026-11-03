param([switch]$SoloComprobar)

$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$comandoDocker = Get-Command docker -ErrorAction SilentlyContinue
$rutaDocker = if ($comandoDocker) { $comandoDocker.Source } else {
    @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $rutaDocker) { throw 'No se encontró Docker Desktop. Instálalo antes de iniciar la base local.' }

Push-Location $raizProyecto
try {
    $dockerDisponible = $false
    try {
        & $rutaDocker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        $dockerDisponible = $LASTEXITCODE -eq 0
    } catch { $dockerDisponible = $false }
    if (-not $dockerDisponible) {
        if ($SoloComprobar) { throw 'Docker está detenido. Ejecuta scripts/iniciar-base-local.ps1 para iniciarlo.' }
        Write-Host 'Iniciando Docker Desktop...'
        & $rutaDocker desktop start
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar Docker. Abre Docker Desktop y vuelve a ejecutar este comando.' }
    }
    if (-not $SoloComprobar) {
        & $rutaDocker compose up -d --wait --wait-timeout 60 db
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL. Revisa Docker Desktop y que el puerto configurado esté libre.' }
    }
    & $rutaDocker compose ps db
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de la base local.' }
    Push-Location (Join-Path $raizProyecto 'apps\api')
    try {
        & node scripts/comprobar-base-local.mjs
        if ($LASTEXITCODE -ne 0) { throw 'La comprobación de PostgreSQL falló. Revisa el mensaje anterior.' }
    } finally { Pop-Location }
} finally { Pop-Location }
