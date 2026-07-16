import { execFile } from 'child_process';
import { BrowserWindow, Rectangle, screen } from 'electron';
import { promisify } from 'util';
import { runtimePath } from '../backend/services/runtimePaths';

const execFileAsync = promisify(execFile);

export type DockSide = 'left' | 'right';

export interface QianniuWindowBounds extends Rectangle {
  hwnd: number;
  minimized: boolean;
}

export interface CompanionDockState {
  attached: boolean;
  side: DockSide;
  collapsed: boolean;
  targetFound: boolean;
}

export function calculateDockedBounds(args: {
  target: Rectangle;
  panelWidth: number;
  side: DockSide;
  workArea: Rectangle;
}): Rectangle {
  const width = Math.min(args.panelWidth, args.workArea.width);
  const height = Math.min(args.target.height, args.workArea.height);
  const preferredX =
    args.side === 'right'
      ? args.target.x + args.target.width
      : args.target.x - width;
  const minX = args.workArea.x;
  const maxX = args.workArea.x + args.workArea.width - width;
  const minY = args.workArea.y;
  const maxY = args.workArea.y + args.workArea.height - height;
  return {
    x: Math.max(minX, Math.min(preferredX, maxX)),
    y: Math.max(minY, Math.min(args.target.y, maxY)),
    width,
    height,
  };
}

export async function locateQianniuWindow(): Promise<
  QianniuWindowBounds | undefined
> {
  const script = runtimePath('scripts', 'qianniu-window-bounds.ps1');
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, timeout: 4000, encoding: 'utf8' },
    );
    const line = stdout.trim().split(/\r?\n/).pop();
    if (!line) return undefined;
    const value = JSON.parse(line) as Partial<QianniuWindowBounds> & {
      found?: boolean;
    };
    if (
      value.found === false ||
      !Number.isFinite(value.hwnd) ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height)
    ) {
      return undefined;
    }
    return {
      hwnd: Number(value.hwnd),
      x: Number(value.x),
      y: Number(value.y),
      width: Number(value.width),
      height: Number(value.height),
      minimized: Boolean(value.minimized),
    };
  } catch {
    return undefined;
  }
}

export class WindowDockingService {
  private timer?: NodeJS.Timeout;

  private autoHidden = false;

  private state: CompanionDockState = {
    attached: true,
    side: 'right',
    collapsed: false,
    targetFound: false,
  };

  constructor(
    private panel: BrowserWindow,
    initial?: Partial<CompanionDockState>,
    private locateTarget = locateQianniuWindow,
  ) {
    this.state = { ...this.state, ...initial };
  }

  public getState(): CompanionDockState {
    return { ...this.state };
  }

  public start(): void {
    if (this.timer) return;
    void this.sync();
    this.timer = setInterval(() => void this.sync(), 1500);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public setAttached(attached: boolean): void {
    this.state.attached = attached;
    if (attached) void this.sync();
  }

  public setSide(side: DockSide): void {
    this.state.side = side;
    if (this.state.attached) void this.sync();
  }

  public setCollapsed(collapsed: boolean): void {
    this.state.collapsed = collapsed;
    if (this.state.attached) void this.sync();
    else this.panel.setSize(collapsed ? 56 : 372, this.panel.getSize()[1]);
  }

  private async sync(): Promise<void> {
    if (!this.state.attached || this.panel.isDestroyed()) return;
    const target = await this.locateTarget();
    this.state.targetFound = Boolean(target);
    if (!target || target.minimized) {
      if (target?.minimized && this.panel.isVisible()) {
        this.autoHidden = true;
        this.panel.hide();
      }
      return;
    }

    const display = screen.getDisplayMatching(target);
    const bounds = calculateDockedBounds({
      target,
      panelWidth: this.state.collapsed ? 56 : 372,
      side: this.state.side,
      workArea: display.workArea,
    });
    this.panel.setBounds(bounds, false);
    if (this.autoHidden) {
      this.autoHidden = false;
      this.panel.showInactive();
    }
  }
}
