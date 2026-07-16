$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class QianniuBoundsProbe
{
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    public static long[] Probe()
    {
        var processIds = new HashSet<uint>();
        foreach (var process in Process.GetProcessesByName("AliWorkbench")) processIds.Add((uint)process.Id);
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, _) => {
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (!processIds.Contains(processId)) return true;
            var title = new StringBuilder(512);
            GetWindowText(hwnd, title, title.Capacity);
            if (title.ToString().Contains("\u5343\u725b\u63a5\u5f85\u53f0")) { result = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        if (result == IntPtr.Zero) return new long[0];
        RECT rect;
        if (!GetWindowRect(result, out rect)) return new long[0];
        return new long[] { result.ToInt64(), rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top, IsIconic(result) ? 1 : 0 };
    }
}
'@

$probe = [QianniuBoundsProbe]::Probe()
if ($probe.Length -eq 0) {
  [ordered]@{ found = $false } | ConvertTo-Json -Compress
  exit 0
}

[ordered]@{
  found = $true
  hwnd = $probe[0]
  x = $probe[1]
  y = $probe[2]
  width = $probe[3]
  height = $probe[4]
  minimized = ($probe[5] -eq 1)
} | ConvertTo-Json -Compress

