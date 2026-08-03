param(
  [switch]$Watch,
  [ValidateRange(100, 5000)]
  [int]$IntervalMs = 200
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

public sealed class CompanionWindowRecord
{
    public string platformId;
    public long hwnd;
    public int x;
    public int y;
    public int width;
    public int height;
    public bool minimized;
    public bool foreground;
}

public static class CompanionBoundsProbe
{
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private static string PlatformForProcess(string processName)
    {
        var name = processName.ToLowerInvariant();
        if (name == "aliworkbench" || name == "qianniu") return "win_qianniu";
        if (name == "jingmai" || name == "jingmaiworkbench" || name == "jdworkstation" || name == "jmworkstation" || name == "jdm_dd_workbench") return "win_jinmai";
        if (name == "wechat" || name == "weixin") return "win_wechat";
        if (name == "wxwork" || name == "wecom") return "win_wecom";
        if (name == "pdd" || name == "pinduoduo" || name == "pinduoduoworkbench") return "win_pdd";
        if (name == "douyin" || name == "douyinshop" || name == "dyworkbench") return "win_douyin";
        return "";
    }

    public static CompanionWindowRecord[] Probe()
    {
        var processes = new Dictionary<uint, string>();
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                var platform = PlatformForProcess(process.ProcessName);
                if (platform.Length > 0) processes[(uint)process.Id] = platform;
            }
            catch { }
        }

        uint foregroundProcessId;
        GetWindowThreadProcessId(GetForegroundWindow(), out foregroundProcessId);
        var candidates = new List<CompanionWindowRecord>();
        EnumWindows((hwnd, _) => {
            if (!IsWindowVisible(hwnd)) return true;
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            var title = new StringBuilder(512);
            GetWindowText(hwnd, title, title.Capacity);
            var windowTitle = title.ToString();
            string platform;
            processes.TryGetValue(processId, out platform);
            if (String.IsNullOrEmpty(platform) &&
                (windowTitle.Contains("\u4eac\u9ea6") || windowTitle.Contains("\u4eac\u4e1c") || windowTitle.Contains("\u54da\u54da")))
                platform = "win_jinmai";
            if (String.IsNullOrEmpty(platform) && windowTitle.Contains("\u62fc\u591a\u591a"))
                platform = "win_pdd";
            if (String.IsNullOrEmpty(platform) && (windowTitle.Contains("\u6296\u5e97") || windowTitle.Contains("\u6296\u97f3")))
                platform = "win_douyin";
            if (String.IsNullOrEmpty(platform)) return true;
            if (platform == "win_qianniu" && !windowTitle.Contains("\u5343\u725b\u63a5\u5f85\u53f0")) return true;
            if (platform != "win_qianniu" && String.IsNullOrWhiteSpace(windowTitle)) return true;

            RECT rect;
            if (!GetWindowRect(hwnd, out rect)) return true;
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            // Minimized windows use the Windows parking rectangle (-32000,
            // -32000). Keep them in the target list so the companion can
            // explicitly hide, then immediately follow once restored.
            if (!IsIconic(hwnd) && (width < 320 || height < 300)) return true;
            candidates.Add(new CompanionWindowRecord {
                platformId = platform,
                hwnd = hwnd.ToInt64(),
                x = rect.Left,
                y = rect.Top,
                width = width,
                height = height,
                minimized = IsIconic(hwnd),
                foreground = processId == foregroundProcessId
            });
            return true;
        }, IntPtr.Zero);

        return candidates
            .GroupBy(item => item.platformId)
            .Select(group => group
                .OrderByDescending(item => item.foreground)
                .ThenByDescending(item => item.width * item.height)
                .First())
            .ToArray();
    }
}
'@

function Invoke-CompanionTargetProbe {
  $targets = [CompanionBoundsProbe]::Probe()
  [ordered]@{ targets = @($targets) } | ConvertTo-Json -Compress -Depth 4
}

if ($Watch) {
  while ($true) {
    try {
      Invoke-CompanionTargetProbe
    } catch {
      [ordered]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
    Start-Sleep -Milliseconds $IntervalMs
  }
} else {
  Invoke-CompanionTargetProbe
}
