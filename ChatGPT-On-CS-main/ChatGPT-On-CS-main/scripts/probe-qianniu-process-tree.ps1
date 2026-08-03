[CmdletBinding()]
param(
  [string[]]$Names = @('AliWorkbench.exe', 'AliRender.exe', 'assistant_dd.exe')
)

$ErrorActionPreference = 'Stop'
$rows = foreach ($name in $Names) {
  Get-CimInstance Win32_Process -Filter "Name = '$name'" -ErrorAction SilentlyContinue |
    Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine
}

[pscustomobject]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  processes = @($rows)
} | ConvertTo-Json -Depth 4
