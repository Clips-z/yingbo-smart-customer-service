param(
  [string]$OutputImage = "",
  [int]$ClickX = -1,
  [int]$ClickY = -1,
  [switch]$AllowWhenForeground,
  [switch]$SkipOcr,
  [switch]$WindowsOcrOnly,
  [switch]$Pretty,
  [switch]$Watch,
  [ValidateRange(100, 5000)]
  [int]$IntervalMs = 300
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$script:watchCleanupCounter = 0
$script:lastWatchOcrFingerprint = ''
$script:lastWatchTabKey = ''
$script:lastWatchTabLines = @()

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

        // Multiple AliWorkbench windows can exist for different logged-in
        // accounts. Prefer the foreground reception window; enumerating all
        // windows otherwise often selects an older tab and reports the wrong
        // shop (for example wheeltec旗舰店 instead of wheeltec品牌店).
        var foreground = GetForegroundWindow();
        if (foreground != IntPtr.Zero)
        {
            uint foregroundProcessId;
            GetWindowThreadProcessId(foreground, out foregroundProcessId);
            if (processIds.Contains(foregroundProcessId))
            {
                var foregroundTitle = new StringBuilder(512);
                GetWindowText(foreground, foregroundTitle, foregroundTitle.Capacity);
                if (foregroundTitle.ToString().Contains("\u5343\u725b\u63a5\u5f85\u53f0"))
                {
                    return foreground;
                }
            }
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
        // Stop above the composer toolbar so its blinking caret and status
        // icons do not trigger a full OCR pass while the chat is unchanged.
        int maxY = Math.Min(bitmap.Height - 1, 650);
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

function Invoke-WindowsOcrFile {
  param(
    [string]$ImagePath,
    [int]$OffsetX = 0,
    [int]$OffsetY = 0,
    [switch]$ActiveTab
  )

  $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream = Wait-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $softwareBitmap = Wait-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) { throw 'Windows OCR engine is unavailable' }
    $ocrResult = Wait-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
    return @($ocrResult.Lines | ForEach-Object {
      $words = @($_.Words)
      if ($words.Count -eq 0) { return }
      $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
      $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
      $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
      $bottom = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
      [ordered]@{
        text = $_.Text
        score = 0.0
        x = [int]$left + $OffsetX
        y = [int]$top + $OffsetY
        width = [int]($right - $left)
        height = [int]($bottom - $top)
        active_tab = [bool]$ActiveTab
      }
    })
  } finally {
    $stream.Dispose()
  }
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

function Get-TabBlueBias {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    $Line
  )

  if ($Line.y -gt 65) { return 0.0 }
  $xStart = [Math]::Max(0, [int]$Line.x - 10)
  $xEnd = [Math]::Min($Bitmap.Width - 1, [int]$Line.x + [int]$Line.width + 10)
  $yStart = [Math]::Max(0, [int]$Line.y - 10)
  $yEnd = [Math]::Min(62, [int]$Line.y + [int]$Line.height + 10)
  $bias = 0.0
  $samples = 0
  for ($y = $yStart; $y -le $yEnd; $y += 2) {
    for ($x = $xStart; $x -le $xEnd; $x += 3) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -lt 180 -and $pixel.B -gt $pixel.R + 10 -and $pixel.B -gt $pixel.G + 3) {
        $bias += $pixel.B - $pixel.R
        $samples += 1
      }
    }
  }
  if ($samples -eq 0) { return 0.0 }
  return [Math]::Round($bias / $samples, 2)
}

function Get-ActiveTabRegion {
  param([System.Drawing.Bitmap]$Bitmap)

  $columns = New-Object int[] $Bitmap.Width
  for ($x = 0; $x -lt [Math]::Min($Bitmap.Width, 1050); $x += 1) {
    $hits = 0
    for ($y = 4; $y -le [Math]::Min(45, $Bitmap.Height - 1); $y += 2) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -lt 180 -and $pixel.B -gt $pixel.R + 10 -and $pixel.B -gt $pixel.G + 3) {
        $hits += 1
      }
    }
    $columns[$x] = $hits
  }

  $clusters = @()
  $start = -1
  for ($x = 0; $x -lt [Math]::Min($Bitmap.Width, 1050); $x += 1) {
    if ($columns[$x] -ge 2 -and $start -lt 0) { $start = $x }
    if (($columns[$x] -lt 2 -or $x -eq [Math]::Min($Bitmap.Width, 1050) - 1) -and $start -ge 0) {
      $end = if ($columns[$x] -lt 2) { $x - 1 } else { $x }
      $width = $end - $start + 1
      if ($width -ge 55 -and $width -le 260) { $clusters += ,@($start, $end) }
      $start = -1
    }
  }

  $ranked = @($clusters | Sort-Object { $_[0] })
  $best = $null
  for ($index = 0; $index -lt $ranked.Count; $index += 1) {
    $cluster = $ranked[$index]
    $sum = 0
    $count = 0
    for ($sampleX = $cluster[0] + 8; $sampleX -le $cluster[1] - 8; $sampleX += 8) {
      $sample = $Bitmap.GetPixel($sampleX, [Math]::Min(20, $Bitmap.Height - 1))
      $sum += $sample.R
      $count += 1
    }
    $score = if ($count) { $sum / $count } else { 255 }
    if (-not $best -or $score -lt $best.Score) {
      $best = [pscustomobject]@{
        Left = [Math]::Max(0, $cluster[0] - 8)
        Right = [Math]::Min($Bitmap.Width - 1, $cluster[1] + 8)
        Index = $index
        Score = $score
      }
    }
  }
  if (-not $best -or $best.Score -ge 180) { return $null }
  return $best
}

function Normalize-ActiveTabForOcr {
  param([System.Drawing.Bitmap]$Bitmap)

  # Windows OCR often drops Chinese glyphs when the selected tab has white
  # text on a saturated blue background. Detect that tab, then turn it into
  # dark text on white while preserving the original bitmap for color scoring.
  $columns = New-Object int[] $Bitmap.Width
  for ($x = 0; $x -lt $Bitmap.Width; $x += 1) {
    $hits = 0
    for ($y = 0; $y -le [Math]::Min(48, $Bitmap.Height - 1); $y += 2) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.B -gt $pixel.R + 10 -and $pixel.B -gt $pixel.G + 3) {
        $hits += 1
      }
    }
    $columns[$x] = $hits
  }
  $clusters = @()
  $start = -1
  for ($x = 0; $x -lt $Bitmap.Width; $x += 1) {
    if ($columns[$x] -ge 2 -and $start -lt 0) { $start = $x }
    if (($columns[$x] -lt 2 -or $x -eq $Bitmap.Width - 1) -and $start -ge 0) {
      $end = if ($columns[$x] -lt 2) { $x - 1 } else { $x }
      if ($end - $start -ge 18) { $clusters += ,@($start, $end) }
      $start = -1
    }
  }
  # Inactive tabs use a pale blue background too, so width alone cannot tell
  # which tab is selected.  The selected tab is the darkest saturated-blue
  # cluster; choose the cluster with the lowest average red channel.
  $active = $clusters |
    ForEach-Object {
      $cluster = $_
      $sampleStart = [Math]::Max($cluster[0], $cluster[0] + 10)
      $sampleEnd = [Math]::Min($cluster[1], $cluster[1] - 10)
      $sum = 0
      $count = 0
      for ($sampleX = $sampleStart; $sampleX -le $sampleEnd; $sampleX += 8) {
        $sample = $Bitmap.GetPixel($sampleX, [Math]::Min(20, $Bitmap.Height - 1))
        $sum += $sample.R
        $count += 1
      }
      [pscustomobject]@{ cluster = $cluster; score = if ($count) { $sum / $count } else { 255 } }
    } |
    Sort-Object score |
    Select-Object -First 1 |
    ForEach-Object { $_.cluster }
  if (-not $active) { return }
  $left = [Math]::Max(0, $active[0] - 8)
  $right = [Math]::Min($Bitmap.Width - 1, $active[1] + 8)
  for ($y = 0; $y -le [Math]::Min(48, $Bitmap.Height - 1); $y += 1) {
    for ($x = $left; $x -le $right; $x += 1) {
      $pixel = $Bitmap.GetPixel($x, $y)
      $isBlue = $pixel.R -lt 180 -and $pixel.B -gt $pixel.R + 10 -and $pixel.B -gt $pixel.G + 3
      # Only white glyphs should become black.  The inactive tab background
      # is also very bright, but has a blue tint; treating it as text creates
      # a solid black rectangle and makes OCR worse than the original image.
      $maxChannel = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
      $minChannel = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
      $isLight = $minChannel -ge 210 -and ($maxChannel - $minChannel) -le 8
      if ($isBlue) {
        $Bitmap.SetPixel($x, $y, [System.Drawing.Color]::White)
      } elseif ($isLight) {
        $Bitmap.SetPixel($x, $y, [System.Drawing.Color]::Black)
      } else {
        $Bitmap.SetPixel($x, $y, [System.Drawing.Color]::White)
      }
    }
  }
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

function Invoke-QianniuCapture {
$script:watchCleanupCounter += 1
if ($Watch -and ($script:watchCleanupCounter % 40 -eq 0)) {
  Get-ChildItem -LiteralPath $env:TEMP -Filter 'chatgpt-on-cs-qianniu-capture-*.png' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddSeconds(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}
$hwnd = [QianniuWindowCapture]::FindReceptionWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  throw 'Qianniu reception window was not found'
}

$qianniuForeground = [QianniuWindowCapture]::IsQianniuForeground()
$clickPerformed = $false
# ClickBackground uses window messages and never moves the user's cursor, so
# foreground Qianniu windows can safely open an unread conversation as well.
if ($ClickX -ge 0 -and $ClickY -ge 0) {
  $clickPerformed = [QianniuWindowCapture]::ClickBackground($hwnd, $ClickX, $ClickY)
  Start-Sleep -Milliseconds 900
}

$bitmap = [QianniuWindowCapture]::Capture($hwnd)
$chatFingerprint = [QianniuWindowCapture]::ChatFingerprint($bitmap)
$activeTabRegion = Get-ActiveTabRegion $bitmap
$activeTabKey = if ($activeTabRegion) {
  "$($hwnd.ToInt64()):$($activeTabRegion.Index):$($activeTabRegion.Left):$($activeTabRegion.Right)"
} else { '' }
$activeTabSlot = if ($activeTabRegion) {
  [Math]::Max(0, [int][Math]::Round(($activeTabRegion.Left - 46) / 176.0))
} else { -1 }
$fastTabLines = @()
$activeTabChanged = [bool]($activeTabKey -and $activeTabKey -ne $script:lastWatchTabKey)
if ($WindowsOcrOnly -and $activeTabRegion) {
  if (-not $Watch -or $activeTabKey -ne $script:lastWatchTabKey) {
    $tabWidth = $activeTabRegion.Right - $activeTabRegion.Left + 1
    $tabHeight = [Math]::Min(52, $bitmap.Height)
    $tabBitmap = $bitmap.Clone(
      (New-Object System.Drawing.Rectangle($activeTabRegion.Left, 0, $tabWidth, $tabHeight)),
      $bitmap.PixelFormat
    )
    try {
      $tabImage = Join-Path $env:TEMP ("chatgpt-on-cs-qianniu-tab-$PID.png")
      $tabBitmap.Save($tabImage, [System.Drawing.Imaging.ImageFormat]::Png)
      $fastTabLines = @(Invoke-WindowsOcrFile $tabImage $activeTabRegion.Left 0 -ActiveTab)
      Remove-Item -LiteralPath $tabImage -Force -ErrorAction SilentlyContinue
      $script:lastWatchTabKey = $activeTabKey
      $script:lastWatchTabLines = $fastTabLines
    } finally {
      $tabBitmap.Dispose()
    }
  } else {
    $fastTabLines = @($script:lastWatchTabLines)
  }
}
# The selected tab slot is detected from the blue tab background and remains
# reliable even when Windows OCR cannot read white text on that tab. Emit the
# switch immediately; the TypeScript context parser can resolve known slots
# without waiting for OCR text.
if ($Watch -and $WindowsOcrOnly -and $activeTabChanged) {
  $storeProbeJson = [ordered]@{
    store_probe = $true
    hwnd = $hwnd.ToInt64()
    width = $bitmap.Width
    height = $bitmap.Height
    image = ''
    ephemeral_image = $true
    chat_fingerprint = $chatFingerprint
    qianniu_foreground = $false
    qianniu_was_foreground = $qianniuForeground
    click_performed = $clickPerformed
    active_tab_index = [int]$activeTabRegion.Index
    active_tab_slot = $activeTabSlot
    active_tab_key = $activeTabKey
    tab_alert_x = @()
    conversation_alerts = @()
    candidate = [ordered]@{
      sender = ''
      content = ''
      confidence = 0.0
      direction = 'unknown'
      latest_direction = 'unknown'
      bubble_blue_bias = 0.0
      lowest_outgoing_y = 0
      x = 0
      y = 0
    }
    recent_messages = @()
    ocr_engine = 'windows'
    lines = @($fastTabLines)
  } | ConvertTo-Json -Depth 5 -Compress
  [Console]::Out.WriteLine($storeProbeJson)
  [Console]::Out.Flush()
}
$skipRepeatedWatchOcr = (
  $Watch -and $WindowsOcrOnly -and
  $script:lastWatchOcrFingerprint -eq $chatFingerprint
)
if ($Watch -and $WindowsOcrOnly -and -not $skipRepeatedWatchOcr) {
  $script:lastWatchOcrFingerprint = $chatFingerprint
}
$ocrLeft = 0
$ocrTop = 0
$ocrBitmap = $bitmap
$ocrBitmapIsCopy = $false
if ($WindowsOcrOnly) {
  # Keep only the active-account tabs, chat header and conversation column for
  # the fast path. The order/product side panel contains far more text but
  # cannot change which buyer should receive the current reply.
  # Keep the complete tab strip. Cropping from 15% clipped the leftmost active
  # shop tab, so the parser fell back to the rightmost tab and every shop could
  # appear to be the same store.
  $ocrLeft = 0
  # Include the tab strip at the very top. It is the only reliable visual
  # signal for which shop/account the operator selected.
  $ocrTop = 0
  $ocrWidth = [Math]::Max(1, [int]($bitmap.Width * 0.78))
  $ocrHeight = [Math]::Max(1, [int]($bitmap.Height * 0.78))
  $ocrWidth = [Math]::Min($ocrWidth, $bitmap.Width - $ocrLeft)
  $ocrHeight = [Math]::Min($ocrHeight, $bitmap.Height - $ocrTop)
  $ocrBitmap = $bitmap.Clone((New-Object System.Drawing.Rectangle($ocrLeft, $ocrTop, $ocrWidth, $ocrHeight)), $bitmap.PixelFormat)
  $ocrBitmapIsCopy = $true
  # OCR runs on the original pixels. The active tab is identified separately
  # from the original capture by its blue-background score; altering the tab
  # bitmap can erase the glyphs on some Windows builds.
}
$tempImage = if ($OutputImage) {
  [IO.Path]::GetFullPath($OutputImage)
} elseif ($Watch) {
  Join-Path $env:TEMP ("chatgpt-on-cs-qianniu-capture-$PID-$([Guid]::NewGuid().ToString('N')).png")
} else {
  Join-Path $env:TEMP 'chatgpt-on-cs-qianniu-capture.png'
}
$ocrBitmap.Save($tempImage, [System.Drawing.Imaging.ImageFormat]::Png)

$lines = @()
$ocrEngine = 'none'
$stream = $null
if (-not $SkipOcr -and -not $skipRepeatedWatchOcr) {
  if (-not $WindowsOcrOnly) {
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
        x = [int]$left + $ocrLeft
        y = [int]$top + $ocrTop
        width = [int]($right - $left)
        height = [int]($bottom - $top)
      }
    })
    $ocrEngine = 'windows'
  }
}

if ($ocrEngine -eq 'windows') {
  if ($fastTabLines.Count -gt 0) {
    $lines = @($lines | Where-Object {
      $center = $_.x + [int]($_.width / 2)
      -not ($_.y -le 65 -and $activeTabRegion -and $center -ge $activeTabRegion.Left -and $center -le $activeTabRegion.Right)
    }) + @($fastTabLines)
  }
  $tabScores = @($lines | Where-Object { $_.y -le 65 } | ForEach-Object {
    [pscustomobject]@{ line = $_; score = Get-TabBlueBias $bitmap $_ }
  })
  $activeTab = $tabScores | Sort-Object score -Descending | Select-Object -First 1
  if ($activeTab -and $activeTab.score -gt 5) {
    # OCR rows are hashtables. Add-Member creates an ETS property that is not
    # serialized by ConvertTo-Json; write the actual key instead.
    if ($activeTab.line -is [System.Collections.IDictionary]) {
      $activeTab.line['active_tab'] = $true
    } else {
      $activeTab.line | Add-Member -NotePropertyName active_tab -NotePropertyValue $true -Force
    }
  }
}

$senderLine = $lines |
  Where-Object {
    $_.x -ge 320 -and $_.x -le 620 -and $_.y -ge 135 -and $_.y -le 185 -and
    # Buyer aliases are often entirely Chinese.  The previous ASCII-only
    # rule made a perfectly readable current conversation lose its customer
    # identity, which in turn prevented the whole reply pipeline from running.
    $_.text.Trim().Length -ge 2 -and $_.text -notmatch '^\s*\d+\s*$'
  } |
  Select-Object -First 1

$incomingLines = @($lines |
  Where-Object {
    $right = $_.x + $_.width
    $blueBias = Get-BubbleBlueBias $bitmap $_
    $_.x -ge 340 -and $_.x -le 520 -and $right -le 760 -and
    $_.y -ge 300 -and $_.y -le 750 -and $blueBias -lt 8 -and
    $_.text -notmatch '^\s*[0O]\s*$' -and
    $_.text -notmatch '20\d\d\s*[-./]\s*\d' -and
    $_.text -notmatch '^\s*(查看订单|订单详情|已读|未读)\s*$' -and
    $_.text -notmatch '^\s*tb\d+\s+20\d\d'
  })

# A buyer request does not have to contain a question mark. Expressions such
# as "有没有30cm的", "要黑色", or "明天发" must reach the reply pipeline.
# Always inspect the newest incoming bubble and suppress only obvious closing
# acknowledgements; never fall back to an older question when the latest buyer
# message is just "好的".
$latestIncomingLine = $incomingLines |
  Sort-Object -Property @{ Expression = { [int]$_.y }; Descending = $true } |
  Select-Object -First 1
# Use regex Unicode escapes because Windows PowerShell 5 may decode a UTF-8
# script through the active legacy code page before the console encoding is
# changed at runtime.
$acknowledgementPattern = '^\s*(?:\u597D|\u597D\u7684|\u597D\u5427|\u55EF|\u55EF\u55EF|\u54E6|\u5662|\u6536\u5230|\u660E\u767D|\u660E\u767D\u4E86|\u8C22\u8C22|\u597D\u7684\u8C22\u8C22|ok|okay|\u884C|\u53EF\u4EE5)\s*[!\uFF01.\u3002~\uFF5E]*\s*$'
$candidateLine = if (
  $latestIncomingLine -and
  $latestIncomingLine.text -notmatch $acknowledgementPattern
) {
  $latestIncomingLine
} else {
  $null
}

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
  ephemeral_image = [bool]$Watch
  chat_fingerprint = $chatFingerprint
  # Keep the existing field non-blocking for older Electron builds while
  # retaining the observed state for diagnostics.
  qianniu_foreground = $false
  qianniu_was_foreground = $qianniuForeground
  click_performed = $clickPerformed
  active_tab_index = if ($activeTabRegion) { [int]$activeTabRegion.Index } else { -1 }
  active_tab_slot = $activeTabSlot
  active_tab_key = $activeTabKey
  tab_alert_x = @(Get-AlertCenters $bitmap)
  conversation_alerts = @(Get-ConversationAlerts $bitmap)
  candidate = [ordered]@{
    sender = if ($senderLine) { $senderLine.text.Trim() } else { '' }
    content = $candidateText
    # Windows OCR is the real-time capture path.  It has already produced the
    # visible bubble text, so keep it above the legacy re-capture threshold:
    # otherwise every incoming message starts a brand-new, slow Python OCR.
    confidence = if ($candidateLine -and $candidateLine.score) { [double]$candidateLine.score } elseif ($candidateLine -and $ocrEngine -eq 'windows') { 0.95 } else { 0.0 }
    direction = if ($candidateLine -and $candidateBlueBias -lt 8) { 'incoming' } else { 'unknown' }
    latest_direction = $latestDirection
    bubble_blue_bias = $candidateBlueBias
    lowest_outgoing_y = $lowestOutgoingY
    x = if ($candidateLine) { $candidateLine.x } else { 0 }
    y = if ($candidateLine) { $candidateLine.y } else { 0 }
  }
  recent_messages = @($incomingLines |
    Sort-Object -Property @{ Expression = { [int]$_.y }; Descending = $false } |
    ForEach-Object {
    [ordered]@{
      direction = 'incoming'
      content = $_.text.Trim() -replace '\s+', ''
      y = $_.y
    }
  })
  ocr_engine = $ocrEngine
  lines = @($lines)
}

$bitmap.Dispose()
if ($ocrBitmapIsCopy) { $ocrBitmap.Dispose() }
if ($stream) { $stream.Dispose() }

if ($Pretty) {
  $result | ConvertTo-Json -Depth 5
} else {
  $result | ConvertTo-Json -Depth 5 -Compress
}
}

if ($Watch) {
  while ($true) {
    try {
      Invoke-QianniuCapture
    } catch {
      [ordered]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
    Start-Sleep -Milliseconds $IntervalMs
  }
} else {
  Invoke-QianniuCapture
}
