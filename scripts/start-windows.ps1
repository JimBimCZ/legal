$ErrorActionPreference = "Stop"

$ImageName = "legal-app"
$ContainerName = "legal-app"
$Port = 8000

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
docker run -d --name $ContainerName @EnvFileArgs -p "${Port}:8000" $ImageName | Out-Null

Write-Host "Backend available at http://localhost:$Port"
