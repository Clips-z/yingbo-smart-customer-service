[CmdletBinding()]
param(
  [int[]]$Ports = @(9222, 9229, 9333, 9515),
  [switch]$IncludeProcessTree
)

$ErrorActionPreference = 'Stop'
$portsResult = foreach ($port in $Ports) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  [pscustomobject]@{
    port = $port
    listening = [bool]$listener
    owningProcessIds = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
  }
}

$result = [ordered]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  ports = @($portsResult)
  processTree = $null
}
if ($IncludeProcessTree) {
  $result.processTree = & (Join-Path $PSScriptRoot 'probe-qianniu-process-tree.ps1') | ConvertFrom-Json
}
$result | ConvertTo-Json -Depth 8
