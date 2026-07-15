param(
  [switch]$Force,
  [string]$SeedResources = ''
)

$ErrorActionPreference = 'Stop'
$AppRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ToolsRoot = Join-Path $AppRoot 'tools'
$PythonRoot = Join-Path $ToolsRoot 'python311'
$PythonExe = Join-Path $PythonRoot 'python.exe'
$PythonVersion = '3.11.9'
$PythonArchive = Join-Path $ToolsRoot "python-$PythonVersion-embed-amd64.zip"

function Assert-UnderTools([string]$Path) {
  $resolved = [IO.Path]::GetFullPath($Path)
  $prefix = $ToolsRoot.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside tools: $resolved"
  }
}

function Reset-Directory([string]$Path) {
  Assert-UnderTools $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Find-BuildPython {
  $commands = @()
  if ($SeedResources) {
    $commands += @{
      File = Join-Path ([IO.Path]::GetFullPath($SeedResources)) '.venv-wechat\Scripts\python.exe'
      Args = @()
    }
  }
  $commands += @(
    @{ File = 'py.exe'; Args = @('-3.11') },
    @{ File = 'python.exe'; Args = @() },
    @{ File = 'python'; Args = @() }
  )
  foreach ($candidate in $commands) {
    try {
      $versionCode = 'import sys; print(str(sys.version_info.major)+chr(46)+str(sys.version_info.minor))'
      $version = & $($candidate.File) @($candidate.Args) -c $versionCode 2>$null
      if ($LASTEXITCODE -eq 0 -and $version.Trim() -eq '3.11') {
        return $candidate
      }
    } catch {
      continue
    }
  }
  throw 'Python 3.11 is required on the build machine to install runtime dependencies.'
}

function Get-PipPython {
  if ($script:PipPython) { return $script:PipPython }
  $base = Find-BuildPython
  $builderRoot = Join-Path $ToolsRoot '.builder-venv'
  $builderPython = Join-Path $builderRoot 'Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $builderPython)) {
    Reset-Directory $builderRoot
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $($base.File) @($base.Args) -m venv $builderRoot 2>$null
    $venvExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    if ($venvExitCode -ne 0 -and $SeedResources) {
      $seedVenv = Join-Path ([IO.Path]::GetFullPath($SeedResources)) '.venv-wechat'
      Copy-Item -LiteralPath (Join-Path $seedVenv 'pyvenv.cfg') -Destination $builderRoot -Force
      Copy-Item -LiteralPath (Join-Path $seedVenv 'Scripts') -Destination $builderRoot -Recurse -Force
      $builderSite = Join-Path $builderRoot 'Lib\site-packages'
      New-Item -ItemType Directory -Path $builderSite -Force | Out-Null
      foreach ($pattern in @('pip', 'pip-*.dist-info', 'setuptools', 'setuptools-*.dist-info', '_distutils_hack')) {
        Copy-Item -Path (Join-Path $seedVenv "Lib\site-packages\$pattern") -Destination $builderSite -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
    if (-not (Test-Path -LiteralPath $builderPython)) {
      throw 'Failed to create the temporary Python build environment.'
    }
  }
  & $builderPython -m pip install --disable-pip-version-check --upgrade 'pip==25.1.1' 'setuptools==80.9.0' 'wheel==0.45.1'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare Python build tooling.' }
  $script:PipPython = @{ File = $builderPython; Args = @() }
  return $script:PipPython
}

function Copy-SeedRuntime {
  if (-not $SeedResources) { return }
  $seed = [IO.Path]::GetFullPath($SeedResources)
  $seedTools = Join-Path $seed 'tools'
  $source = Join-Path $seedTools 'python311'
  if ((Test-Path -LiteralPath $source) -and ($Force -or -not (Test-Path -LiteralPath $PythonRoot))) {
    Reset-Directory $PythonRoot
    Copy-Item -Path (Join-Path $source '*') -Destination $PythonRoot -Recurse -Force
  }
}

function Ensure-EmbeddedPython {
  if ((Test-Path -LiteralPath $PythonExe) -and -not $Force) { return }
  Reset-Directory $PythonRoot
  if (-not (Test-Path -LiteralPath $PythonArchive)) {
    $url = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
    Write-Host "Downloading Python $PythonVersion embeddable runtime..."
    Invoke-WebRequest -Uri $url -OutFile $PythonArchive
  }
  Expand-Archive -LiteralPath $PythonArchive -DestinationPath $PythonRoot -Force
  @('python311.zip', '.', 'import site') | Set-Content -LiteralPath (Join-Path $PythonRoot 'python311._pth') -Encoding ASCII
}

function Install-Target([string]$Name, [string]$Requirements) {
  $target = Join-Path $ToolsRoot $Name
  $hashMaterial = Get-Content -LiteralPath $Requirements -Raw
  foreach ($line in (Get-Content -LiteralPath $Requirements)) {
    if ($line -match '^\s*-r\s+(.+?)\s*$') {
      $nested = [IO.Path]::GetFullPath((Join-Path (Split-Path $Requirements) $Matches[1]))
      $hashMaterial += "`n--- $nested ---`n" + (Get-Content -LiteralPath $nested -Raw)
    }
  }
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = [BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashMaterial))).Replace('-', '')
  } finally {
    $sha256.Dispose()
  }
  $stamp = Join-Path $target '.requirements.sha256'
  if (-not $Force -and (Test-Path -LiteralPath $stamp) -and ((Get-Content -Raw $stamp).Trim() -eq $hash)) {
    Write-Host "Runtime dependency set is current: $Name"
    return
  }

  $builder = Get-PipPython
  Reset-Directory $target
  Write-Host "Installing runtime dependency set: $Name"
  & $($builder.File) @($builder.Args) -m pip install --disable-pip-version-check --no-build-isolation --no-compile --upgrade --target $target -r $Requirements
  if ($LASTEXITCODE -ne 0) { throw "pip install failed for $Name" }
  Set-Content -LiteralPath $stamp -Value $hash -Encoding ASCII
}

function Test-Import([string]$Target, [string]$Imports) {
  $targetPath = Join-Path $ToolsRoot $Target
  $code = "import site; site.addsitedir(r'$targetPath'); $Imports; print('ok')"
  $output = & $PythonExe -X utf8 -c $code
  $lastLine = if ($null -eq $output) { '' } else { @($output)[-1].ToString().Trim() }
  if ($LASTEXITCODE -ne 0 -or $lastLine -ne 'ok') {
    throw "Runtime import check failed: $Target"
  }
}

New-Item -ItemType Directory -Path $ToolsRoot -Force | Out-Null
Copy-SeedRuntime
Ensure-EmbeddedPython

$runtimeRoot = Join-Path $AppRoot 'runtime'
Install-Target 'rapidocr-py311' (Join-Path $runtimeRoot 'requirements-rapidocr.txt')
Install-Target 'wechat-py311' (Join-Path $runtimeRoot 'requirements-wechat.txt')
Install-Target 'rag-py311' (Join-Path $runtimeRoot 'requirements-rag.txt')

Test-Import 'rapidocr-py311' 'import rapidocr, onnxruntime, numpy, PIL'
Test-Import 'wechat-py311' 'import pyautogui, pywinauto, win32api, onnxruntime; from rapidocr_onnxruntime import RapidOCR'
Test-Import 'rag-py311' 'import chromadb, fastapi, uvicorn, onnxruntime'
Write-Host 'Bundled Python runtime is ready.'
