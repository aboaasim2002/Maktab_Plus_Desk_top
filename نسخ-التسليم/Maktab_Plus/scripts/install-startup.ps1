$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$productionScript = Join-Path $PSScriptRoot 'start-production.ps1'
$caddyScript = Join-Path $PSScriptRoot 'start-caddy.ps1'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty `
  -Path $runKey `
  -Name 'MaktabPlusApplication' `
  -Value "`"$powershell`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$productionScript`""
Set-ItemProperty `
  -Path $runKey `
  -Name 'MaktabPlusCaddy' `
  -Value "`"$powershell`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$caddyScript`""

if (-not (netstat -ano | Select-String -Quiet ':3000\s+.*LISTENING')) {
  Start-Process `
    -FilePath $powershell `
    -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$productionScript`"" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden
}

if (-not (Get-Process -Name caddy -ErrorAction SilentlyContinue)) {
  Start-Process `
    -FilePath $powershell `
    -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$caddyScript`"" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden
}
