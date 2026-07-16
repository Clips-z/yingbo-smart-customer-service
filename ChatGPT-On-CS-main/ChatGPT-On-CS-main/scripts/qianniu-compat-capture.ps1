param(
  [string]$OutputImage = "",
  [int]$ClickX = -1,
  [int]$ClickY = -1,
  [switch]$AllowWhenForeground,
  [switch]$SkipOcr,
  [switch]$Pretty
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

public static class QianniuWindowCapture
{
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hwnd, ref POINT point);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    public static IntPtr FindReceptionWindow()
    {
        var processIds = new HashSet<uint>();
        foreach (var process in Process.GetProcessesByName("AliWorkbench"))
        {
            processIds.Add((uint)process.Id);
        }

        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (!processIds.Contains(processId)) return true;

            var title = new StringBuilder(512);
            GetWindowText(hwnd, title, title.Capacity);
            if (title.ToString().Contains("\u5343\u725b\u63a5\u5f85\u53f0"))
            {
                result = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }

    public static Bitmap Capture(IntPtr hwnd)
    {
        RECT rect;
        if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("GetWindowRect failed");
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) throw new InvalidOperationException("Invalid window bounds");

        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            IntPtr hdc = graphics.GetHdc();
            try
            {
                if (!PrintWindow(hwnd, hdc, 2)) throw new InvalidOperationException("PrintWindow failed");
            }
            finally
            {
                graphics.ReleaseHdc(hdc);
            }
        }
        return bitmap;
    }

    public static string ChatFingerprint(Bitmap bitmap)
    {
        int maxX = Math.Min(bitmap.Width - 1, 838);
        int maxY = Math.Min(bitmap.Height - 1, 705);
        var bytes = new List<byte>();
        for (int y = 130; y <= maxY; y += 4)
        {
            for (int x = 305; x <= maxX; x += 4)
            {
                Color pixel = bitmap.GetPixel(x, y);
                bytes.Add(pixel.R);
                bytes.Add(pixel.G);
                bytes.Add(pixel.B);
            }
        }
        using (var sha = SHA256.Create())
        {
            byte[] hash = sha.ComputeHash(bytes.ToArray());
            var text = new StringBuilder(hash.Length * 2);
            foreach (byte value in hash) text.Append(value.ToString("x2"));
            return text.ToString();
        }
    }

    public static bool IsQianniuForeground()
    {
        IntPtr foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero) return false;
        uint processId;
        GetWindowThreadProcessId(foreground, out processId);
        foreach (var process in Process.GetProcessesByName("AliWorkbench"))
        {
            if ((uint)process.Id == processId) return true;
        }
        return false;
    }

    public static bool ClickBackground(IntPtr hwnd, int x, int y)
    {
        RECT rect;
        if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("GetWindowRect failed");
        var point = new POINT { X = rect.Left + x, Y = rect.Top + y };
        if (!ScreenToClient(hwnd, ref point)) throw new InvalidOperationException("ScreenToClient failed");
        int packed = (point.Y << 16) | (point.X & 0xffff);
        var lParam = new IntPtr(packed);
        PostMessage(hwnd, 0x0200, UIntPtr.Zero, lParam);
        bool down = PostMessage(hwnd, 0x0201, new UIntPtr(1), lParam);
        System.Threading.Thread.Sleep(30);
        bool up = PostMessage(hwnd, 0x0202, UIntPtr.Zero, lParam);
        return down && up;
    }
}
'@

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null

function Wait-WinRt {
  param($Operation, [Type]$ResultType)

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Get-AlertCenters {
  param([System.Drawing.Bitmap]$Bitmap)

  $hits = New-Object System.Collections.Generic.List[int]
  $maxX = [Math]::Min($Bitmap.Width - 1, 900)
  $maxY = [Math]::Min($Bitmap.Height - 1, 58)
  for ($y = 6; $y -le $maxY; $y += 2) {
    for ($x = 0; $x -le $maxX; $x += 2) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -ge 205 -and $pixel.G -le 100 -and $pixel.B -le 110) {
        $hits.Add($x)
      }
    }
  }

  if ($hits.Count -eq 0) { return @() }
  $centers = New-Object System.Collections.Generic.List[int]
  $cluster = New-Object System.Collections.Generic.List[int]
  foreach ($x in ($hits | Sort-Object)) {
    if ($cluster.Count -gt 0 -and $x - $cluster[$cluster.Count - 1] -gt 18) {
      $centers.Add([int](($cluster | Measure-Object -Average).Average))
      $cluster.Clear()
    }
    $cluster.Add($x)
  }
  if ($cluster.Count -gt 0) {
    $centers.Add([int](($cluster | Measure-Object -Average).Average))
  }
  return @($centers | Where-Object { $_ -gt 40 })
}

function Get-ConversationAlerts {
  param([System.Drawing.Bitmap]$Bitmap)

  $points = New-Object System.Collections.Generic.List[object]
  $maxY = [Math]::Min($Bitmap.Height - 1, 930)
  for ($y = 140; $y -le $maxY; $y += 2) {
    for ($x = 220; $x -le 300; $x += 2) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -ge 205 -and $pixel.G -le 100 -and $pixel.B -le 115) {
        $points.Add([pscustomobject]@{ x = $x; y = $y })
      }
    }
  }

  if ($points.Count -eq 0) { return @() }
  $groups = @()
  $current = New-Object System.Collections.Generic.List[object]
  foreach ($point in ($points | Sort-Object y, x)) {
    if ($current.Count -gt 0 -and $point.y - $current[$current.Count - 1].y -gt 18) {
      if ($current.Count -ge 3) { $groups += ,($current.ToArray()) }
      $current = New-Object System.Collections.Generic.List[object]
    }
    $current.Add($point)
  }
  if ($current.Count -ge 3) { $groups += ,($current.ToArray()) }

  return @($groups | ForEach-Object {
    [ordered]@{
      x = [int](($_ | Measure-Object x -Average).Average)
      y = [int](($_ | Measure-Object y -Average).Average)
      pixels = $_.Count
    }
  })
}

function Get-BubbleBlueBias {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    $Line
  )

  $xStart = [Math]::Max(305, [int]$Line.x - 14)
  $xEnd = [Math]::Min(838, [int]$Line.x + [int]$Line.width + 14)
  $yStart = [Math]::Max(285, [int]$Line.y - 8)
  $yEnd = [Math]::Min(760, [int]$Line.y + [int]$Line.height + 8)
  $bias = 0.0
  $samples = 0

  for ($y = $yStart; $y -le $yEnd; $y += 2) {
    for ($x = $xStart; $x -le $xEnd; $x += 3) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -ge 185 -and $pixel.G -ge 185 -and $pixel.B -ge 185) {
        $bias += $pixel.B - $pixel.R
        $samples += 1
      }
    }
  }

  if ($samples -eq 0) { return 0.0 }
  return [Math]::Round($bias / $samples, 2)
}

function Get-LowestOutgoingBubbleY {
  param([System.Drawing.Bitmap]$Bitmap)

  $lowestY = 0
  $maxX = [Math]::Min($Bitmap.Width - 1, 838)
  $maxY = [Math]::Min($Bitmap.Height - 1, 705)
  for ($y = 290; $y -le $maxY; $y += 2) {
    $hits = 0
    for ($x = 450; $x -le $maxX; $x += 4) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if (
        $pixel.R -ge 205 -and $pixel.G -ge 215 -and $pixel.B -ge 225 -and
        $pixel.B - $pixel.R -ge 10 -and $pixel.B - $pixel.G -ge 3
      ) {
        $hits += 1
      }
    }
    if ($hits -ge 3) { $lowestY = $y }
  }
  return $lowestY
}

$hwnd = [QianniuWindowCapture]::FindReceptionWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  throw 'Qianniu reception window was not found'
}

$qianniuForeground = [QianniuWindowCapture]::IsQianniuForeground()
$clickPerformed = $false
if (
  $ClickX -ge 0 -and $ClickY -ge 0 -and
  (-not $qianniuForeground -or $AllowWhenForeground)
) {
  $clickPerformed = [QianniuWindowCapture]::ClickBackground($hwnd, $ClickX, $ClickY)
  Start-Sleep -Milliseconds 900
}

$bitmap = [QianniuWindowCapture]::Capture($hwnd)
$tempImage = if ($OutputImage) {
  [IO.Path]::GetFullPath($OutputImage)
} else {
  Join-Path $env:TEMP 'chatgpt-on-cs-qianniu-capture.png'
}
$bitmap.Save($tempImage, [System.Drawing.Imaging.ImageFormat]::Png)

$lines = @()
$ocrEngine = 'none'
$stream = $null
if (-not $SkipOcr) {
  $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $python = Join-Path $projectRoot 'tools\python311\python.exe'
  if (-not (Test-Path -LiteralPath $python)) {
    $python = Join-Path $projectRoot '.venv-wechat\Scripts\python.exe'
  }
  $rapidScript = Join-Path $PSScriptRoot 'qianniu-rapidocr.py'
  if ((Test-Path -LiteralPath $python) -and (Test-Path -LiteralPath $rapidScript)) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $rapidJson = & $python -X utf8 $rapidScript $tempImage 2>$null | Select-Object -Last 1
    $rapidExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    if ($rapidExitCode -eq 0 -and $rapidJson) {
      $rapidResult = $rapidJson | ConvertFrom-Json
      if ($rapidResult.ok) {
        $lines = @($rapidResult.lines)
        $ocrEngine = 'rapidocr'
      }
    }
  }

  if ($ocrEngine -eq 'none') {
    $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tempImage)) ([Windows.Storage.StorageFile])
    $stream = Wait-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $softwareBitmap = Wait-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) { throw 'Windows OCR engine is unavailable' }
    $ocrResult = Wait-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @($ocrResult.Lines | ForEach-Object {
      $words = @($_.Words)
      if ($words.Count -eq 0) { return }
      $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
      $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
      $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
      $bottom = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
      [ordered]@{
        text = $_.Text
        score = 0.0
        x = [int]$left
        y = [int]$top
        width = [int]($right - $left)
        height = [int]($bottom - $top)
      }
    })
    $ocrEngine = 'windows'
  }
}

$senderLine = $lines |
  Where-Object {
    $_.x -ge 320 -and $_.x -le 620 -and $_.y -ge 135 -and $_.y -le 185 -and
    $_.text -match '[A-Za-z0-9_]{5,}'
  } |
  Select-Object -First 1

$candidateLine = $lines |
  Where-Object {
    $right = $_.x + $_.width
    $blueBias = Get-BubbleBlueBias $bitmap $_
    $_.x -ge 340 -and $_.x -le 520 -and $right -le 760 -and
    $_.y -ge 300 -and $_.y -le 750 -and $blueBias -lt 8 -and
    $_.text -notmatch '^\s*[0O]\s*$' -and
    $_.text -notmatch '^\s*20\d\d' -and
    $_.text -notmatch 'https?://' -and
    $_.text -notmatch '^\s*tb\d+\s+20\d\d'
  } |
  Sort-Object y -Descending |
  Select-Object -First 1

$candidateText = if ($candidateLine) {
  $candidateLine.text.Trim() -replace '\s+', ''
} else {
  ''
}
$candidateBlueBias = if ($candidateLine) {
  Get-BubbleBlueBias $bitmap $candidateLine
} else {
  0.0
}
$lowestOutgoingY = Get-LowestOutgoingBubbleY $bitmap
$latestDirection = if (-not $candidateLine) {
  'unknown'
} elseif ($lowestOutgoingY -gt $candidateLine.y + $candidateLine.height + 5) {
  'outgoing'
} else {
  'incoming'
}

$result = [ordered]@{
  hwnd = $hwnd.ToInt64()
  width = $bitmap.Width
  height = $bitmap.Height
  image = $tempImage
  chat_fingerprint = [QianniuWindowCapture]::ChatFingerprint($bitmap)
  qianniu_foreground = $qianniuForeground
  click_performed = $clickPerformed
  tab_alert_x = @(Get-AlertCenters $bitmap)
  conversation_alerts = @(Get-ConversationAlerts $bitmap)
  candidate = [ordered]@{
    sender = if ($senderLine) { $senderLine.text.Trim() } else { '' }
    content = $candidateText
    confidence = if ($candidateLine -and $candidateLine.score) { [double]$candidateLine.score } else { 0.0 }
    direction = if ($candidateLine -and $candidateBlueBias -lt 8) { 'incoming' } else { 'unknown' }
    latest_direction = $latestDirection
    bubble_blue_bias = $candidateBlueBias
    lowest_outgoing_y = $lowestOutgoingY
    x = if ($candidateLine) { $candidateLine.x } else { 0 }
    y = if ($candidateLine) { $candidateLine.y } else { 0 }
  }
  ocr_engine = $ocrEngine
  lines = @($lines)
}

$bitmap.Dispose()
if ($stream) { $stream.Dispose() }

if ($Pretty) {
  $result | ConvertTo-Json -Depth 5
} else {
  $result | ConvertTo-Json -Depth 5 -Compress
}
