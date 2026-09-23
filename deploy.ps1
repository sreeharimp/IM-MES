# Automation script to deploy the MES application to the VPS (62.72.31.120)
# Uses PuTTY tools (pscp.exe and plink.exe) which are pre-configured on this system.

param (
    [string]$passphrase = "Sree#00007#"
)

$ppkKey = "C:\Users\imsre\.ssh\agney-server.ppk"
$vpsUser = "root"
$vpsHost = "62.72.31.120"
$remoteDir = "/root/agney-mes"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploying IM-MES Production Tracker to VPS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Ensure directory exists on the VPS
Write-Host "1. Creating remote directory: $remoteDir..." -ForegroundColor Yellow
$passphrase | & "C:\Program Files\PuTTY\plink.exe" -i $ppkKey "$vpsUser@$vpsHost" "mkdir -p $remoteDir"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Connection failed. Please verify the credentials." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Copy code and config files to the VPS using pscp
Write-Host "2. Copying project files to VPS..." -ForegroundColor Yellow
$passphrase | & "C:\Program Files\PuTTY\pscp.exe" -i $ppkKey -r .env Caddyfile Dockerfile .dockerignore docker-compose.yml nginx.conf package.json package-lock.json eslint.config.js tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html public src "$vpsUser@$vpsHost`:$remoteDir"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to copy files to VPS." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Build and launch Docker container on the VPS using plink
Write-Host "3. Rebuilding and starting Docker Compose containers on VPS..." -ForegroundColor Yellow
$passphrase | & "C:\Program Files\PuTTY\plink.exe" -i $ppkKey "$vpsUser@$vpsHost" "cd $remoteDir && docker compose down && docker compose up --build -d"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start Docker Compose containers on VPS." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "Access the application at: https://mes.agneypolysoft.com" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
