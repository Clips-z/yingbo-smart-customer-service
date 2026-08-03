import { ChildProcess, spawn } from 'child_process';
import { BrowserWindow, Rectangle, screen } from 'electron';
import readline from 'readline';
import { runtimePath } from '../backend/services/runtimePaths';

export type DockSide = 'left' | 'right';
export type CompanionPlatformId = 'win_qianniu' | 'win_jinmai' | 'win_wechat' | 'win_wecom';
export type CompanionTargetMode = 'follow' | CompanionPlatformId;

export interface CompanionTargetWindow extends Rectangle {
  platformId: CompanionPlatformId;
  hwnd: number;
  minimized: boolean;
  foreground: boolean;
}

export interface CompanionDockState {
  attached: boolean;
  side: DockSide;
  sideByPlatform: Partial<Record<CompanionPlatformId, DockSide>>;
  collapsed: boolean;
  targetFound: boolean;
  targetMode: CompanionTargetMode;
  activePlatformId?: CompanionPlatformId;
}

const PLATFORM_PRIORITY: CompanionPlatformId[] = [
  'win_qianniu',
  'win_jinmai',
  'win_wechat',
  'win_wecom',
];

function isDockSide(value: unknown): value is DockSide {
  return value === 'left' || value === 'right';
}

function isTargetMode(value: unknown): value is CompanionTargetMode {
  return value === 'follow' || isPlatformId(value);
}

export function normalizeCompanionDockState(
  initial?: Partial<CompanionDockState>,
): CompanionDockState {
  const legacySide = isDockSide(initial?.side) ? initial.side : 'right';
  const persistedSides = initial?.sideByPlatform;
  const sideByPlatform: Partial<Record<CompanionPlatformId, DockSide>> = {};
  if (persistedSides && typeof persistedSides === 'object') {
    PLATFORM_PRIORITY.forEach((platformId) => {
      const side = persistedSides[platformId];
      if (isDockSide(side)) sideByPlatform[platformId] = side;
    });
  } else if (initial?.side !== undefined) {
    // The legacy preference only ever represented the Qianniu companion.
    sideByPlatform.win_qianniu = legacySide;
  }
  return {
    attached: typeof initial?.attached === 'boolean' ? initial.attached : true,
    side: legacySide,
    sideByPlatform,
    collapsed:
      typeof initial?.collapsed === 'boolean' ? initial.collapsed : false,
    targetFound: false,
    targetMode: isTargetMode(initial?.targetMode)
      ? initial.targetMode
      : 'follow',
    activePlatformId: isPlatformId(initial?.activePlatformId)
      ? initial.activePlatformId
      : undefined,
  };
}

export function resolveDockSide(
  state: Pick<CompanionDockState, 'side' | 'sideByPlatform'>,
  platformId?: CompanionPlatformId,
): DockSide {
  if (platformId && isDockSide(state.sideByPlatform[platformId])) {
    return state.sideByPlatform[platformId] as DockSide;
  }
  return platformId === 'win_qianniu' && isDockSide(state.side)
    ? state.side
    : 'right';
}

export function chooseCompanionTarget(
  targets: CompanionTargetWindow[],
  mode: CompanionTargetMode,
  previousPlatformId?: CompanionPlatformId,
): CompanionTargetWindow | undefined {
  const usable = targets.filter(
    (target) => target.width > 0 && target.height > 0,
  );
  if (mode !== 'follow') {
    return usable.find((target) => target.platformId === mode);
  }
  const foreground = usable.find((target) => target.foreground);
  if (foreground) return foreground;
  if (previousPlatformId) {
    const previous = usable.find(
      (target) => target.platformId === previousPlatformId,
    );
    if (previous) return previous;
  }
  return PLATFORM_PRIORITY.map((platformId) =>
    usable.find((target) => target.platformId === platformId),
  ).find((target): target is CompanionTargetWindow => Boolean(target));
}

export function calculateDockedBounds(args: {
  target: Rectangle;
  panelWidth: number;
  side: DockSide;
  workArea: Rectangle;
}): Rectangle {
  const width = Math.min(args.panelWidth, args.workArea.width);
  const height = Math.min(args.target.height, args.workArea.height);
  const rightX = args.target.x + args.target.width;
  const leftX = args.target.x - width;
  const minX = args.workArea.x;
  const maxX = args.workArea.x + args.workArea.width - width;
  // Preserve the selected side even at a desktop edge. Windows clips the
  // overflow, keeping the other side free for a second workbench.
  const preferredX =
    args.side === 'right'
      ? rightX
      : leftX;
  const minY = args.workArea.y;
  const maxY = args.workArea.y + args.workArea.height - height;
  return {
    x: preferredX,
    y: Math.max(minY, Math.min(args.target.y, maxY)),
    width,
    height,
  };
}

function isPlatformId(value: unknown): value is CompanionPlatformId {
  return PLATFORM_PRIORITY.includes(value as CompanionPlatformId);
}

function parseTarget(value: unknown): CompanionTargetWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<CompanionTargetWindow>;
  if (
    !isPlatformId(candidate.platformId) ||
    !Number.isFinite(candidate.hwnd) ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height)
  ) {
    return undefined;
  }
  return {
    platformId: candidate.platformId,
    hwnd: Number(candidate.hwnd),
    x: Number(candidate.x),
    y: Number(candidate.y),
    width: Number(candidate.width),
    height: Number(candidate.height),
    minimized: Boolean(candidate.minimized),
    foreground: Boolean(candidate.foreground),
  };
}

type PendingProbe = {
  afterSequence: number;
  resolve: (targets: CompanionTargetWindow[]) => void;
  timer: NodeJS.Timeout;
};

class CompanionWindowProbe {
  private process?: ChildProcess;

  private sequence = 0;

  private pending = new Set<PendingProbe>();

  public locate(): Promise<CompanionTargetWindow[]> {
    if (process.platform !== 'win32') return Promise.resolve([]);
    this.ensureProcess();
    const afterSequence = this.sequence;
    return new Promise<CompanionTargetWindow[]>((resolve) => {
      const timer = setTimeout(() => {
        const pending = [...this.pending].find(
          (item) => item.resolve === resolve,
        );
        if (pending) this.pending.delete(pending);
        resolve([]);
      }, 2_500);
      this.pending.add({ afterSequence, resolve, timer });
    });
  }

  public stop(): void {
    this.reset();
  }

  private ensureProcess(): void {
    if (this.process && !this.process.killed) return;
    const script = runtimePath('scripts', 'companion-target-window.ps1');
    const worker = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-Watch',
        '-IntervalMs',
        '150',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    this.process = worker;
    const output = readline.createInterface({ input: worker.stdout! });
    output.on('line', (line) => this.handleLine(line));
    worker.on('error', () => this.reset());
    worker.on('exit', () => {
      if (this.process === worker) this.reset();
    });
  }

  private handleLine(line: string): void {
    try {
      const payload = JSON.parse(line) as { targets?: unknown[] } | unknown[];
      const values = Array.isArray(payload) ? payload : payload.targets;
      const targets = (values || [])
        .map(parseTarget)
        .filter((target): target is CompanionTargetWindow => Boolean(target));
      this.sequence += 1;
      for (const pending of [...this.pending]) {
        if (this.sequence <= pending.afterSequence) continue;
        clearTimeout(pending.timer);
        this.pending.delete(pending);
        pending.resolve(targets);
      }
    } catch {
      // Ignore one malformed helper line and wait for the next snapshot.
    }
  }

  private reset(): void {
    const worker = this.process;
    this.process = undefined;
    if (worker && !worker.killed) worker.kill();
    for (const pending of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve([]);
    }
    this.pending.clear();
  }
}

const companionWindowProbe = new CompanionWindowProbe();

export async function locateCompanionWindows(): Promise<
  CompanionTargetWindow[]
> {
  // Keep the native probe loaded. Spawning PowerShell and compiling the C# P/
  // Invoke bridge for each dock tick cost 600–750 ms by itself.
  return companionWindowProbe.locate();
}

/** Backward-compatible helper used by older callers and diagnostics. */
export async function locateQianniuWindow(): Promise<
  CompanionTargetWindow | undefined
> {
  return (await locateCompanionWindows()).find(
    (target) => target.platformId === 'win_qianniu',
  );
}

export class WindowDockingService {
  private timer?: NodeJS.Timeout;

  private autoHidden = false;

  private syncInFlight = false;

  private candidatePlatformId?: CompanionPlatformId;

  private candidateSince = 0;

  private state: CompanionDockState = {
    attached: true,
    side: 'right',
    sideByPlatform: {},
    collapsed: false,
    targetFound: false,
    targetMode: 'follow',
  };

  constructor(
    private panel: BrowserWindow,
    initial?: Partial<CompanionDockState>,
    private locateTargets = locateCompanionWindows,
    // A platform window is already verified as foreground by the native probe.
    // Keep a short debounce for accidental focus flashes, not the old nearly
    // one-second wait that made the assistant visibly trail the operator.
    private switchDelayMs = 180,
    private onStateChange?: (state: CompanionDockState) => void,
    private expandedWidth = 372,
  ) {
    this.state = normalizeCompanionDockState(initial);
  }

  public getState(): CompanionDockState {
    return { ...this.state };
  }

  public start(): void {
    if (this.timer) return;
    void this.sync();
    this.timer = setInterval(() => void this.sync(), 250);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // The default locator owns a persistent PowerShell watcher. Do not leave
    // it behind after the companion window has closed.
    if (this.locateTargets === locateCompanionWindows) companionWindowProbe.stop();
  }

  public setAttached(attached: boolean): void {
    this.state.attached = attached;
    this.publishState();
    if (attached) void this.sync();
  }

  public setSide(side: DockSide): void {
    this.state.side = side;
    if (this.state.activePlatformId) {
      this.state.sideByPlatform[this.state.activePlatformId] = side;
    }
    this.publishState();
    if (this.state.attached) void this.sync();
  }

  public setTargetMode(targetMode: CompanionTargetMode): void {
    this.state.targetMode = targetMode;
    this.candidatePlatformId = undefined;
    this.candidateSince = 0;
    this.publishState();
    if (this.state.attached) void this.sync();
  }

  public setCollapsed(collapsed: boolean): void {
    this.state.collapsed = collapsed;
    this.publishState();
    if (this.state.attached) void this.sync();
    else
      this.panel.setSize(
        collapsed ? 56 : this.expandedWidth,
        this.panel.getSize()[1],
      );
  }

  private commitStableTarget(
    target: CompanionTargetWindow,
  ): CompanionTargetWindow | undefined {
    if (
      this.state.targetMode !== 'follow' ||
      !this.state.activePlatformId ||
      this.state.activePlatformId === target.platformId
    ) {
      const platformChanged = this.state.activePlatformId !== target.platformId;
      this.state.activePlatformId = target.platformId;
      this.candidatePlatformId = undefined;
      if (platformChanged) this.publishState();
      return target;
    }
    if (this.candidatePlatformId !== target.platformId) {
      this.candidatePlatformId = target.platformId;
      this.candidateSince = Date.now();
      return undefined;
    }
    if (Date.now() - this.candidateSince < this.switchDelayMs) return undefined;
    this.state.activePlatformId = target.platformId;
    this.candidatePlatformId = undefined;
    this.publishState();
    return target;
  }

  private publishState(): void {
    this.onStateChange?.(this.getState());
  }

  private async sync(): Promise<void> {
    if (this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      await this.syncOnce();
    } finally {
      this.syncInFlight = false;
    }
  }

  private async syncOnce(): Promise<void> {
    if (this.panel.isDestroyed()) return;
    const targets = await this.locateTargets();
    const selected = chooseCompanionTarget(
      targets,
      this.state.targetMode,
      this.state.activePlatformId,
    );
    const targetFound = Boolean(selected);
    if (this.state.targetFound !== targetFound) {
      this.state.targetFound = targetFound;
      this.publishState();
    }
    if (!selected) return;
    const target = this.commitStableTarget(selected);
    if (!target || target.minimized) {
      if (
        this.state.attached &&
        target?.minimized &&
        this.panel.isVisible()
      ) {
        this.autoHidden = true;
        this.panel.hide();
      }
      return;
    }
    // Floating controls window position only. Platform and conversation
    // selection must continue following the foreground supported platform.
    if (!this.state.attached) return;

    const display = screen.getDisplayMatching(target);
    const bounds = calculateDockedBounds({
      target,
      panelWidth: this.state.collapsed ? 56 : this.expandedWidth,
      side: resolveDockSide(this.state, target.platformId),
      workArea: display.workArea,
    });
    this.panel.setBounds(bounds, false);
    if (this.autoHidden) {
      this.autoHidden = false;
      this.panel.showInactive();
    }
  }
}
