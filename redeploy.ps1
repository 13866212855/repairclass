# ==================================================================
# repairclass - Local Docker Deployment Script (PowerShell engine)
# Bootstrap: redeploy.bat (2-line launcher, LF/CRLF immune)
# Image/Container: repairclass   Host port: 7859 -> 3000
# ==================================================================

$ImageName     = "repairclass"
$ContainerName = "repairclass"
$HostPort      = "7859"
$InternalPort  = "3000"
# No local database/persistent files (external Neon PostgreSQL), keep empty
$VolumeMount   = ""

Set-Location -Path $PSScriptRoot

Write-Host "========================================"
Write-Host " $ImageName - Docker Deployment (Windows)"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/4] Building Docker image..."
docker build -t "${ImageName}:latest" .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed. Deployment aborted."
    exit 1
}
Write-Host "Build successful."
Write-Host ""

Write-Host "[2/4] Stopping and removing old container..."
docker stop $ContainerName 2>$null
docker rm $ContainerName 2>$null
Write-Host "Done."
Write-Host ""

Write-Host "[3/4] Cleaning up dangling images..."
docker images $ImageName -q --filter "dangling=true" | ForEach-Object { docker rmi $_ 2>$null }
Write-Host "Done."
Write-Host ""

Write-Host "[4/4] Starting new container..."
$runArgs = @("run", "-d", "--name", $ContainerName, "-p", "${HostPort}:${InternalPort}")
if ($VolumeMount -ne "") { $runArgs += $VolumeMount.Split(" ") }
$runArgs += @("--restart", "unless-stopped", "${ImageName}:latest")
docker @runArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start Docker container."
    exit 1
}
Write-Host ""

Write-Host "[Verify] Waiting 3 seconds, then checking container status..."
Start-Sleep -Seconds 3
docker ps | Select-String $ContainerName
Write-Host ""

Write-Host "========================================"
Write-Host " Deployment Successful!"
Write-Host " Access URL: http://localhost:$HostPort"
Write-Host "========================================"
