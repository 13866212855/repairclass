# ==================================================================
# repairclass - Local Docker Deployment (Single-Domain Multi-Service)
# Bootstrap: redeploy.bat (2-line launcher, LF/CRLF immune)
#
# Topology (all on Docker network "mynet"):
#   repairclass-nginx  : host 7859 -> nginx:80 (single entrance gateway)
#     /       -> repairclass:3000  (main Node/Express app)
#     /pyapp/ -> pyapp:8501        (secondary Streamlit app)
#   pyapp             : host 8518 -> 8501 (direct LAN access)
#   repairclass       : internal only (no host port)
# ==================================================================

$ProjectName = "repairclass"

Set-Location -Path $PSScriptRoot

Write-Host "========================================"
Write-Host " $ProjectName - Multi-Service Deployment"
Write-Host " Entrance: http://localhost:7859"
Write-Host "   /      -> repairclass (main app)"
Write-Host "   /pyapp/ -> pyapp (Streamlit twin)"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/5] Checking docker compose availability..."
docker compose version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] 'docker compose' is not available. Please update Docker Desktop."
    exit 1
}
Write-Host "OK."
Write-Host ""

Write-Host "[2/5] Ensuring shared Docker network 'mynet' exists..."
$netId = docker network ls --filter "name=^mynet$" --format "{{.ID}}"
if ([string]::IsNullOrEmpty($netId)) {
    docker network create mynet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create Docker network 'mynet'."
        exit 1
    }
    Write-Host "Network 'mynet' created."
} else {
    Write-Host "Network 'mynet' already exists."
}
Write-Host ""

Write-Host "[3/5] Removing legacy single-container deployment (if any)..."
# Containers from the old plain-docker topology carry no compose labels,
# so 'compose down' cannot remove them - stop/rm them explicitly.
foreach ($c in @("repairclass-nginx", "repairclass", "pyapp")) {
    docker stop $c 2>$null
    docker rm $c 2>$null
}
docker compose down --remove-orphans 2>$null
Write-Host "Done."
Write-Host ""

Write-Host "[4/5] Building images and starting all services..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] docker compose up failed. Deployment aborted."
    exit 1
}
Write-Host "All services started."
Write-Host ""

Write-Host "[5/5] Waiting 5 seconds, then checking container status..."
Start-Sleep -Seconds 5
docker ps --filter "name=repairclass" --filter "name=pyapp" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host ""

Write-Host "========================================"
Write-Host " Deployment Successful!"
Write-Host " Main App  : http://localhost:7859/"
Write-Host " Streamlit : http://localhost:7859/pyapp/"
Write-Host " Direct    : http://localhost:8518/pyapp/"
Write-Host "========================================"
