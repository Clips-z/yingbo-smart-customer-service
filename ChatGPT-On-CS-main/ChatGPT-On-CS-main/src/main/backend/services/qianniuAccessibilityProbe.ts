import { execFile } from 'child_process';
import { promisify } from 'util';
import { runtimePath } from './runtimePaths';

const execFileAsync = promisify(execFile);

export type QianniuAccessibilityMode =
  | 'probing'
  | 'uia-msaa-primary'
  | 'accessibility-partial'
  | 'clipboard-assisted'
  | 'unavailable';

export interface QianniuAccessibilityReport {
  ok: boolean;
  captured_at?: string;
  error?: string;
  window?: {
    process_id?: number;
    title?: string;
  };
  uia?: {
    node_count?: number;
    has_cef_browser?: boolean;
    has_chrome_host?: boolean;
  };
  msaa?: {
    node_count?: number;
    visible_contact_candidates?: number;
    visible_product_nodes?: number;
    central_message_nodes?: number;
    central_input_nodes?: number;
  };
  capabilities?: {
    can_read_contact?: boolean;
    can_resolve_active_contact?: boolean;
    can_read_messages?: boolean;
    can_locate_input?: boolean;
    can_read_products?: boolean;
    primary_eligible?: boolean;
  };
  recommendation?: string;
}

export interface QianniuAccessibilityState {
  mode: QianniuAccessibilityMode;
  checkedAt?: string;
  report?: QianniuAccessibilityReport;
  reason?: string;
}

export function classifyQianniuAccessibility(
  report: QianniuAccessibilityReport,
): QianniuAccessibilityState {
  if (!report.ok) {
    return {
      mode: 'unavailable',
      checkedAt: report.captured_at,
      report,
      reason: report.error || 'Qianniu accessibility probe failed',
    };
  }

  const capabilities = report.capabilities || {};
  if (
    capabilities.primary_eligible &&
    capabilities.can_resolve_active_contact &&
    capabilities.can_read_messages &&
    capabilities.can_locate_input
  ) {
    return {
      mode: 'uia-msaa-primary',
      checkedAt: report.captured_at,
      report,
    };
  }

  if (capabilities.can_read_contact || capabilities.can_read_products) {
    return {
      mode: 'accessibility-partial',
      checkedAt: report.captured_at,
      report,
      reason:
        'Accessibility can enrich customer or product context but cannot read the complete chat and input box',
    };
  }

  return {
    mode: 'clipboard-assisted',
    checkedAt: report.captured_at,
    report,
    reason: 'Qianniu chat content is not exposed through accessibility',
  };
}

export async function runQianniuAccessibilityProbe(): Promise<QianniuAccessibilityState> {
  if (process.platform !== 'win32') {
    return { mode: 'unavailable', reason: 'Windows accessibility is required' };
  }
  try {
    const script = runtimePath('scripts', 'probe-qianniu-accessibility.ps1');
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-MaxMsaaNodes',
        '2500',
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      },
    );
    const report = JSON.parse(stdout.trim()) as QianniuAccessibilityReport;
    return classifyQianniuAccessibility(report);
  } catch (error) {
    return {
      mode: 'unavailable',
      checkedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
