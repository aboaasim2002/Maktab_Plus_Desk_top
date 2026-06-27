$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'runtime-logs'
$logFile = Join-Path $logDirectory 'application.log'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $projectRoot

$node = (Get-Command node.exe).Source
$next = Join-Path $projectRoot 'node_modules\next\dist\bin\next'

while ($true) {
  try {
    Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Starting Next.js"
    & $node $next start --hostname 127.0.0.1 --port 3000 *>> $logFile
    Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Next.js exited; restarting in 3 seconds"
  } catch {
    Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Next.js failed: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 3
}
