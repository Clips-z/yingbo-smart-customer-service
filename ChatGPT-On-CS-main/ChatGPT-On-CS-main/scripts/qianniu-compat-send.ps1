param(
  [Parameter(Mandatory = $true)]
  [string]$ReplyFile,
  [string]$Sender = '',
  [switch]$SelectOnly,
  [switch]$Submit
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class QianniuReplyInput
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
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extraInfo);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
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

    public static void FocusEditor(IntPtr hwnd)
    {
        RECT rect;
        if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("GetWindowRect failed");
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        ShowWindow(hwnd, 9);
        SetForegroundWindow(hwnd);
        SetCursorPos(rect.Left + (int)(width * 0.44), rect.Top + height - 105);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }

    public static void FocusSearch(IntPtr hwnd)
    {
        RECT rect;
        if (!GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("GetWindowRect failed");
        int width = rect.Right - rect.Left;
        ShowWindow(hwnd, 9);
        SetForegroundWindow(hwnd);
        SetCursorPos(rect.Left + Math.Min(180, (int)(width * 0.12)), rect.Top + 164);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
}
'@

$replyPath = (Resolve-Path $ReplyFile).Path
$reply = [IO.File]::ReadAllText($replyPath, [Text.Encoding]::UTF8).Trim()
if (-not $reply) { throw 'Reply file is empty' }

$hwnd = [QianniuReplyInput]::FindReceptionWindow()
if ($hwnd -eq [IntPtr]::Zero) { throw 'Qianniu reception window was not found' }

$cursorPosition = [System.Windows.Forms.Cursor]::Position
$previousClipboard = if ([System.Windows.Forms.Clipboard]::ContainsText()) {
  [System.Windows.Forms.Clipboard]::GetText()
} else {
  $null
}

try {
  if ($Sender.Trim()) {
    [QianniuReplyInput]::FocusSearch($hwnd)
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.Clipboard]::SetText($Sender.Trim())
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 350
    [System.Windows.Forms.SendKeys]::SendWait('{DOWN}')
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 700
  }

  if ($SelectOnly) {
    [ordered]@{
      success = $true
      selected = $true
      filled = $false
      submitted = $false
    } | ConvertTo-Json -Compress
    return
  }

  [QianniuReplyInput]::FocusEditor($hwnd)
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.Clipboard]::SetText($reply)
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 200
  if ($Submit) {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
} finally {
  if ($null -ne $previousClipboard) {
    [System.Windows.Forms.Clipboard]::SetText($previousClipboard)
  }
  [System.Windows.Forms.Cursor]::Position = $cursorPosition
}

[ordered]@{
  success = $true
  selected = [bool]($Sender.Trim())
  filled = $true
  submitted = [bool]$Submit
  length = $reply.Length
} | ConvertTo-Json -Compress
