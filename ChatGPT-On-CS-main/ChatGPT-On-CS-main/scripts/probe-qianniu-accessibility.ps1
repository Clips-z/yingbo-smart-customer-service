param(
  [int]$MaxMsaaNodes = 2500,
  [int]$MaxUiaNodes = 500,
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName Accessibility
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public sealed class QianniuWindowSnapshot {
  public long Handle { get; set; }
  public int ProcessId { get; set; }
  public string Title { get; set; }
  public string ClassName { get; set; }
  public bool Visible { get; set; }
  public int Left { get; set; }
  public int Top { get; set; }
  public int Right { get; set; }
  public int Bottom { get; set; }
}

public sealed class QianniuMsaaNode {
  public int Role { get; set; }
  public int State { get; set; }
  public int ChildCount { get; set; }
  public string Name { get; set; }
  public string Value { get; set; }
  public int X { get; set; }
  public int Y { get; set; }
  public int Width { get; set; }
  public int Height { get; set; }
}

public static class QianniuAccessibilityNative {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  private struct Rect { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")]
  private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")]
  private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("oleacc.dll")]
  private static extern int AccessibleObjectFromWindow(
    IntPtr hwnd,
    uint objectId,
    ref Guid iid,
    [In, Out, MarshalAs(UnmanagedType.Interface)] ref object accessible
  );
  [DllImport("oleacc.dll")]
  private static extern int AccessibleChildren(
    Accessibility.IAccessible container,
    int start,
    int count,
    [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 2)] object[] children,
    out int obtained
  );

  public static QianniuWindowSnapshot[] FindReceptionWindows() {
    var result = new List<QianniuWindowSnapshot>();
    EnumWindows((hwnd, _) => {
      uint processId;
      GetWindowThreadProcessId(hwnd, out processId);
      string processName;
      try { processName = Process.GetProcessById((int)processId).ProcessName; }
      catch { return true; }
      if (!processName.Equals("AliWorkbench", StringComparison.OrdinalIgnoreCase)) return true;

      var title = new StringBuilder(512);
      var className = new StringBuilder(256);
      GetWindowText(hwnd, title, title.Capacity);
      GetClassName(hwnd, className, className.Capacity);
      if (title.ToString().IndexOf("\u5343\u725B\u63A5\u5F85\u53F0", StringComparison.OrdinalIgnoreCase) < 0) return true;

      Rect rect;
      GetWindowRect(hwnd, out rect);
      result.Add(new QianniuWindowSnapshot {
        Handle = hwnd.ToInt64(),
        ProcessId = (int)processId,
        Title = title.ToString(),
        ClassName = className.ToString(),
        Visible = IsWindowVisible(hwnd),
        Left = rect.Left,
        Top = rect.Top,
        Right = rect.Right,
        Bottom = rect.Bottom
      });
      return true;
    }, IntPtr.Zero);
    return result.ToArray();
  }

  private static string SafeText(Func<string> getter) {
    try {
      var value = (getter() ?? "").Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' ').Trim();
      Uri uri;
      if (Uri.TryCreate(value, UriKind.Absolute, out uri)) {
        value = uri.GetLeftPart(UriPartial.Path);
      }
      value = Regex.Replace(
        value,
        "(?i)(sessionkey|sign|token|secret|authorization)=([^&\\s]+)",
        "$1=[REDACTED]"
      );
      return value.Length > 240 ? value.Substring(0, 240) : value;
    } catch { return ""; }
  }

  public static QianniuMsaaNode[] ReadMsaa(long handle, int maxNodes) {
    var iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    object rootObject = null;
    var hr = AccessibleObjectFromWindow(new IntPtr(handle), 0xFFFFFFFC, ref iid, ref rootObject);
    if (hr != 0 || rootObject == null) return new QianniuMsaaNode[0];

    var queue = new Queue<Accessibility.IAccessible>();
    queue.Enqueue((Accessibility.IAccessible)rootObject);
    var result = new List<QianniuMsaaNode>();
    while (queue.Count > 0 && result.Count < maxNodes) {
      var accessible = queue.Dequeue();
      var childCount = -1;
      var role = -1;
      var state = 0;
      var x = 0; var y = 0; var width = 0; var height = 0;
      try { childCount = accessible.accChildCount; } catch { }
      try { role = Convert.ToInt32(accessible.get_accRole(0)); } catch { }
      try { state = Convert.ToInt32(accessible.get_accState(0)); } catch { }
      try { accessible.accLocation(out x, out y, out width, out height, 0); } catch { }
      result.Add(new QianniuMsaaNode {
        Role = role,
        State = state,
        ChildCount = childCount,
        Name = SafeText(() => accessible.get_accName(0)),
        Value = SafeText(() => accessible.get_accValue(0)),
        X = x,
        Y = y,
        Width = width,
        Height = height
      });

      if (childCount <= 0) continue;
      var children = new object[childCount];
      var obtained = 0;
      try { AccessibleChildren(accessible, 0, childCount, children, out obtained); }
      catch { continue; }
      for (var index = 0; index < obtained; index++) {
        var child = children[index] as Accessibility.IAccessible;
        if (child != null) queue.Enqueue(child);
      }
    }
    return result.ToArray();
  }
}
'@ -ReferencedAssemblies Accessibility

$windows = @([QianniuAccessibilityNative]::FindReceptionWindows()) |
  Where-Object { $_.Visible } |
  Sort-Object { ($_.Right - $_.Left) * ($_.Bottom - $_.Top) } -Descending

if ($windows.Count -eq 0) {
  $report = [ordered]@{
    ok = $false
    captured_at = [DateTimeOffset]::Now.ToString('o')
    error = 'No visible Qianniu reception window was found'
    capabilities = [ordered]@{
      can_read_contact = $false
      can_resolve_active_contact = $false
      can_read_messages = $false
      can_locate_input = $false
      can_read_products = $false
      primary_eligible = $false
    }
    recommendation = 'clipboard-assisted'
  }
} else {
  $window = $windows[0]
  $root = [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$window.Handle)
  $walker = [Windows.Automation.TreeWalker]::RawViewWalker
  $uiaQueue = [Collections.Generic.Queue[object]]::new()
  $uiaQueue.Enqueue($root)
  $uiaCount = 0
  $uiaClasses = [Collections.Generic.HashSet[string]]::new()
  while ($uiaQueue.Count -gt 0 -and $uiaCount -lt $MaxUiaNodes) {
    $element = $uiaQueue.Dequeue()
    $uiaCount += 1
    try { [void]$uiaClasses.Add($element.Current.ClassName) } catch { }
    try {
      $child = $walker.GetFirstChild($element)
      $guard = 0
      while ($null -ne $child -and $guard -lt 100) {
        $uiaQueue.Enqueue($child)
        $child = $walker.GetNextSibling($child)
        $guard += 1
      }
    } catch { }
  }

  $nodes = @([QianniuAccessibilityNative]::ReadMsaa($window.Handle, $MaxMsaaNodes))
  $visibleMask = 0x8000 -bor 0x10000
  $visibleNodes = @($nodes | Where-Object {
    ($_.State -band $visibleMask) -eq 0 -and $_.Width -gt 0 -and $_.Height -gt 0
  })
  $buyerLabel = -join @([char]0x4E70, [char]0x5BB6, [char]0x6635, [char]0x79F0)
  $contacts = @($visibleNodes | Where-Object {
    $_.Name -match ('^' + [regex]::Escape($buyerLabel) + '\s+\S+')
  })
  $productNodes = @($visibleNodes | Where-Object {
    $_.Name -match '(?i)\bID\s*\d{6,}'
  })

  $centerLeft = $window.Left + [Math]::Floor(($window.Right - $window.Left) * 0.23)
  $centerRight = $window.Right - [Math]::Floor(($window.Right - $window.Left) * 0.36)
  $conversationTop = $window.Top + [Math]::Floor(($window.Bottom - $window.Top) * 0.34)
  $centerNodes = @($visibleNodes | Where-Object {
    $_.X -ge $centerLeft -and $_.X -lt $centerRight -and $_.Y -ge $conversationTop
  })
  $messageNodes = @($centerNodes | Where-Object {
    $_.Role -eq 41 -and $_.Name.Length -ge 2
  })
  $inputNodes = @($centerNodes | Where-Object { $_.Role -eq 42 })

  $canReadContact = $contacts.Count -gt 0
  $canResolveActiveContact = $contacts.Count -eq 1
  $canReadMessages = $messageNodes.Count -gt 0
  $canLocateInput = $inputNodes.Count -gt 0
  $primaryEligible = $canResolveActiveContact -and $canReadMessages -and $canLocateInput

  $report = [ordered]@{
    ok = $true
    captured_at = [DateTimeOffset]::Now.ToString('o')
    window = [ordered]@{
      handle = ('0x{0:X}' -f $window.Handle)
      process_id = $window.ProcessId
      title = $window.Title
      class_name = $window.ClassName
      bounds = [ordered]@{
        left = $window.Left
        top = $window.Top
        right = $window.Right
        bottom = $window.Bottom
      }
    }
    uia = [ordered]@{
      node_count = $uiaCount
      has_cef_browser = $uiaClasses.Contains('CefBrowserWindow')
      has_chrome_host = $uiaClasses.Contains('Chrome_RenderWidgetHostHWND')
    }
    msaa = [ordered]@{
      node_count = $nodes.Count
      visible_node_count = $visibleNodes.Count
      visible_contact_candidates = $contacts.Count
      visible_product_nodes = $productNodes.Count
      central_message_nodes = $messageNodes.Count
      central_input_nodes = $inputNodes.Count
    }
    capabilities = [ordered]@{
      can_read_contact = $canReadContact
      can_resolve_active_contact = $canResolveActiveContact
      can_read_messages = $canReadMessages
      can_locate_input = $canLocateInput
      can_read_products = $productNodes.Count -gt 0
      primary_eligible = $primaryEligible
    }
    recommendation = if ($primaryEligible) { 'uia-msaa-primary' } else { 'clipboard-assisted' }
  }
}

$json = $report | ConvertTo-Json -Depth 8
if ($OutputPath) {
  $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved))
  [IO.File]::WriteAllText($resolved, $json, [Text.UTF8Encoding]::new($false))
}
$json
