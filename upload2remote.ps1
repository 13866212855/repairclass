# ==================================================================
# repairclass - Remote Deployment (Single-Domain Multi-Service)
# Bootstrap: upload2remote.bat (2-line launcher, LF/CRLF immune)
#
# Builds 3 images locally, saves into ONE tar, scp to remote,
# docker load + run on shared network mynet:
#   repairclass-nginx : host 7859 -> 80 (gateway, started LAST)
#   pyapp             : host 8518 -> 8501 (Streamlit twin)
#   repairclass       : internal only (main app)
# ==================================================================

# ====== CONFIGURABLE VARIABLES ======
$MainImage     = "repairclass:latest"
$PyappImage    = "repairclass-pyapp:latest"
$NginxImage    = "repairclass-nginx:latest"

$MainContainer   = "repairclass"
$PyappContainer  = "pyapp"
$NginxContainer  = "repairclass-nginx"

$EntrancePort  = "7859"
$PyappPort     = "8518"

$NetworkName   = "mynet"

$TarDir  = "d:\temp\tar"
$TarFile = Join-Path $TarDir "repairclass-multi.tar"

$RemoteUser     = "gpzx"
$RemoteHost     = "172.29.173.42"
$RemotePassword = "9520111"
$RemoteTarDir   = "/bak/tar"
$RemoteTarget   = "$RemoteUser@$RemoteHost"

Write-Host "========================================================"
Write-Host "   Deploying repairclass multi-service stack to Remote"
Write-Host "========================================================"
Write-Host ""

Set-Location -Path $PSScriptRoot

Write-Host "[Step 1/8] Running MCP Server script if exists..."
if (Test-Path "skills\my_create_mcp\my_create_mcp.js") {
    node "skills\my_create_mcp\my_create_mcp.js"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] MCP Server generation script failed!"
        exit 1
    }
} else {
    Write-Host "[INFO] MCP Server generation script not found, skipping."
}
Write-Host ""

Write-Host "[Step 2/8] Checking local temp directories..."
if (-not (Test-Path $TarDir)) {
    New-Item -ItemType Directory -Path $TarDir | Out-Null
    Write-Host "Created directory: $TarDir"
} else {
    Write-Host "Directory already exists: $TarDir"
}
Write-Host ""

Write-Host "[Step 3/8] Building 3 Docker images locally..."
Write-Host "  [3a] Main app image..."
docker build -t $MainImage .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Main image build failed!"
    exit 1
}
Write-Host "  [3b] Streamlit pyapp image..."
docker build -t $PyappImage -f pyapp.Dockerfile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pyapp image build failed!"
    exit 1
}
Write-Host "  [3c] Nginx gateway image..."
docker build -t $NginxImage ./nginx
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] nginx image build failed!"
    exit 1
}
Write-Host "[SUCCESS] All 3 images built successfully!"
Write-Host ""

Write-Host "[Step 4/8] Saving 3 images into one tar file..."
docker save -o $TarFile $MainImage $PyappImage $NginxImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker image save failed!"
    exit 1
}
Write-Host "[SUCCESS] Images saved to $TarFile"
Write-Host ""

Write-Host "[Step 5/8] Uploading image tar to remote server..."
Write-Host "Uploading to ${RemoteTarget}:$RemoteTarDir/"
Write-Host "Note: If prompted for password, enter: $RemotePassword"
# Push-Location + bare filename: a drive-letter path (d:\...) would be
# mistaken by scp as host:path because of the colon
$TarName = Split-Path $TarFile -Leaf
Push-Location $TarDir
scp $TarName "${RemoteTarget}:$RemoteTarDir/"
$scpExit = $LASTEXITCODE
Pop-Location
if ($scpExit -ne 0) {
    Write-Host "[ERROR] SCP upload failed! Please verify OpenSSH client and remote server accessibility."
    exit 1
}
Write-Host "[SUCCESS] File uploaded successfully!"
Write-Host ""

Write-Host "[Step 6/8] Loading images on remote server..."
ssh $RemoteTarget "docker load -i $RemoteTarDir/$TarName"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Remote docker load failed!"
    exit 1
}
Write-Host "[SUCCESS] Remote docker load succeeded!"
Write-Host ""

Write-Host "[Step 7/8] Ensuring remote network and cleaning old containers..."
ssh $RemoteTarget "docker network create $NetworkName 2>/dev/null || true; docker stop $NginxContainer $PyappContainer $MainContainer 2>/dev/null || true; docker rm $NginxContainer $PyappContainer $MainContainer 2>/dev/null || true"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Remote cleanup encountered issues. Continuing..."
} else {
    Write-Host "[SUCCESS] Remote network ready, old containers removed."
}
Write-Host ""

Write-Host "[Step 8/8] Running 3 containers on remote (nginx last)..."
ssh $RemoteTarget "docker run -d --name $MainContainer --network $NetworkName --restart unless-stopped $MainImage"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start remote main container!"
    exit 1
}
ssh $RemoteTarget "docker run -d --name $PyappContainer -p ${PyappPort}:8501 --network $NetworkName --restart unless-stopped $PyappImage"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start remote pyapp container!"
    exit 1
}
# Small delay: nginx resolves upstream hostnames at config load time,
# so repairclass/pyapp must already exist on the network
Start-Sleep -Seconds 5
ssh $RemoteTarget "docker run -d --name $NginxContainer -p ${EntrancePort}:80 --network $NetworkName --restart unless-stopped $NginxImage"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start remote nginx container!"
    exit 1
}
Write-Host "[SUCCESS] Remote containers started successfully!"
Write-Host ""

Write-Host "[Verification] Waiting 3 seconds to check container status..."
Start-Sleep -Seconds 3
ssh $RemoteTarget "docker ps" | Select-String "repairclass|pyapp"
Write-Host ""

Write-Host "========================================================"
Write-Host "   Deployment Completed Successfully!"
Write-Host "========================================================"
Write-Host " Main App  : http://${RemoteHost}:$EntrancePort/"
Write-Host " Streamlit : http://${RemoteHost}:$EntrancePort/pyapp/"
Write-Host " Direct    : http://${RemoteHost}:$PyappPort/pyapp/"
Write-Host " Remote Tar: ${RemoteHost}:$RemoteTarDir/$TarName"
