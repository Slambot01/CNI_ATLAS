# Start CNI in development mode (frontend + backend)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectRoot "cni\server\frontend"

Write-Host "==> Starting Next.js dev server..."
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Set-Location '$FrontendDir'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "==> Starting CNI API server..."
cni serve . --no-browser

Write-Host "CNI running at http://localhost:3000"
