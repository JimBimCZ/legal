$ErrorActionPreference = "Stop"

$ContainerName = "legal-app"

$running = docker ps -q -f "name=^$ContainerName`$"
if ($running) {
    Write-Host "Stopping container '$ContainerName'..."
    docker stop $ContainerName | Out-Null
    docker rm $ContainerName | Out-Null
    Write-Host "Stopped."
    exit 0
}

$stopped = docker ps -aq -f "name=^$ContainerName`$"
if ($stopped) {
    docker rm $ContainerName | Out-Null
    Write-Host "Removed stopped container '$ContainerName'."
} else {
    Write-Host "Container '$ContainerName' is not running."
}
