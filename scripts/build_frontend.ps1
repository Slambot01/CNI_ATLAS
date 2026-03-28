# Build the CNI frontend for production
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectRoot "cni\server\frontend"

Write-Host "==> Installing frontend dependencies..."
Set-Location $FrontendDir
npm install

Write-Host "==> Building frontend..."
npm run build

Write-Host ""
Write-Host "Frontend built successfully." -ForegroundColor Green
Write-Host "  Run 'cni serve .' to start the web UI."
