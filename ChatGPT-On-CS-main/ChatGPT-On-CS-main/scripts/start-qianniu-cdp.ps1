[CmdletBinding()]
param(
  [int]$Port = 9333,
  [string]$ExecutablePath,
  [switch]$Launch
)

$ErrorActionPreference = 'Stop'
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'AliWorkbench.exe'")
if ($running.Count -gt 0) {
  Write-Output 'AliWorkbench.exe is already running. Close it first if you want to test a debug launch.'
  $running | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine | Format-List
  exit 2
}
if (-not $Launch) {
  Write-Output 'Read-only mode: no client was started.'
  Write-Output "Re-run with -Launch -Port $Port after confirming the executable path."
  exit 0
}
if (-not $ExecutablePath) {
  $candidate = Get-ChildItem -Path "$env:APPDATA\asist_rbt" -Filter 'AliWorkbench.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  $ExecutablePath = $candidate.FullName
}
if (-not $ExecutablePath -or -not (Test-Path -LiteralPath $ExecutablePath)) { throw 'AliWorkbench.exe was not found. Pass -ExecutablePath explicitly.' }
$arguments = @("--remote-debugging-port=$Port", '--remote-debugging-address=127.0.0.1')
Write-Output "Starting AliWorkbench with a localhost-only CDP endpoint on port $Port."
Start-Process -FilePath $ExecutablePath -WorkingDirectory (Split-Path -Parent $ExecutablePath) -ArgumentList $arguments
