$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$caddy = Join-Path $projectRoot 'tools\caddy\caddy.exe'
$config = Join-Path $projectRoot 'Caddyfile'
$caddyData = Join-Path $projectRoot '.data\caddy\data'
$caddyConfig = Join-Path $projectRoot '.data\caddy\config'

New-Item -ItemType Directory -Path $caddyData -Force | Out-Null
New-Item -ItemType Directory -Path $caddyConfig -Force | Out-Null
$env:XDG_DATA_HOME = $caddyData
$env:XDG_CONFIG_HOME = $caddyConfig
Set-Location -LiteralPath $projectRoot

& $caddy run --config $config --adapter caddyfile
