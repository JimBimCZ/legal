$ErrorActionPreference = "Stop"

$ImageName = "legal-app"
$ContainerName = "legal-app"
$Port = 8000
# Named volume for the SQLite database. Survives `docker rm` (which both this
# script and stop-windows.ps1 do), so accounts and saved documents persist across
# restarts. Remove it with `docker volume rm legal-app-data` for a clean slate.
$DataVolume = "legal-app-data"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$running = docker ps -q -f "name=^$ContainerName`$"
if ($running) {
    Write-Host "Container '$ContainerName' is already running at http://localhost:$Port"
    exit 0
}

$stopped = docker ps -aq -f "name=^$ContainerName`$"
if ($stopped) {
    Write-Host "Removing stopped container '$ContainerName'..."
    docker rm $ContainerName | Out-Null
}

Write-Host "Building image '$ImageName'..."
docker build -t $ImageName $ProjectRoot

$EnvFilePath = Join-Path $ProjectRoot ".env"
$EnvFileArgs = @()
if (Test-Path $EnvFilePath) {
    $EnvFileArgs = @("--env-file", $EnvFilePath)
} else {
    Write-Host "Warning: no .env file found at $EnvFilePath — the AI chat feature needs OPENROUTER_API_KEY to work."
}

Write-Host "Starting container '$ContainerName' on port $Port..."
docker run -d --name $ContainerName @EnvFileArgs -v "${DataVolume}:/app/data" -p "${Port}:8000" $ImageName | Out-Null

Write-Host "Backend available at http://localhost:$Port"
