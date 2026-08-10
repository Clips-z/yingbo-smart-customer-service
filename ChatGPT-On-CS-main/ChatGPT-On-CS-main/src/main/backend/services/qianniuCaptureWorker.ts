import { ChildProcess, spawn } from 'child_process';
import readline from 'readline';
import { getRuntimeRoot, runtimePath } from './runtimePaths';

export type QianniuCaptureSnapshot = {
  store_probe?: boolean;
  hwnd: number;
  width: number;
  height: number;
  image: string;
  ephemeral_image?: boolean;
  chat_fingerprint: string;
  qianniu_foreground: boolean;
  qianniu_was_foreground?: boolean;
  click_performed: boolean;
  active_tab_index?: number;
  active_tab_slot?: number;
  active_tab_key?: string;
  tab_alert_x: number[];
  conversation_alerts: Array<{ x: number; y: number; pixels: number }>;
  candidate: {
    sender: string;
    content: string;
    confidence: number;
    direction: 'incoming' | 'unknown';
    latest_direction: 'incoming' | 'outgoing' | 'unknown';
    bubble_blue_bias: number;
    lowest_outgoing_y: number;
    x: number;
    y: number;
  };
  ocr_engine: 'rapidocr' | 'windows' | 'none';
  lines: Array<{
    text: string;
    score: number;
    x: number;
    y: number;
    width: number;
    height: number;
    active_tab?: boolean;
  }>;
  recent_messages?: Array<{
    direction: 'incoming' | 'outgoing';
    content: string;
    y: number;
  }>;
};

type PendingCapture = {
  afterSequence: number;
  resolve: (snapshot: QianniuCaptureSnapshot) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export function buildQianniuCaptureWorkerArgs(script: string): string[] {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-WindowsOcrOnly',
    '-Watch',
    '-IntervalMs',
    '150',
  ];
}

export function reusePreviousQianniuRecognition(
  snapshot: QianniuCaptureSnapshot,
  previous?: QianniuCaptureSnapshot,
): QianniuCaptureSnapshot {
  if (
    snapshot.ocr_engine !== 'none' ||
    !previous ||
    previous.chat_fingerprint !== snapshot.chat_fingerprint ||
    previous.ocr_engine === 'none'
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    candidate: previous.candidate,
    ocr_engine: previous.ocr_engine,
    lines: previous.lines,
    ...(previous.recent_messages
      ? { recent_messages: previous.recent_messages }
      : {}),
  };
}

/**
 * Keeps the PowerShell capture host alive. Starting a new PowerShell process
 * for every visible-customer check costs roughly one second on a normal
 * workstation; this worker pays that startup cost once and then streams a
 * fresh screenshot fingerprint every few hundred milliseconds. The resident
 * PowerShell host keeps Windows OCR initialized, runs it only when the chat
 * fingerprint changes, and reuses the last recognition for unchanged frames.
 */
export class QianniuCaptureWorker {
  private process?: ChildProcess;

  private sequence = 0;

  private latest?: QianniuCaptureSnapshot;

  private pending = new Set<PendingCapture>();

  private stderrTail = '';

  public async capture(): Promise<QianniuCaptureSnapshot> {
    this.ensureProcess();
    const afterSequence = this.sequence;
    return new Promise<QianniuCaptureSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = [...this.pending].find(
          (item) => item.resolve === resolve,
        );
        if (pending) this.pending.delete(pending);
        reject(new Error('Qianniu capture worker timed out'));
      }, 5_000);
      this.pending.add({ afterSequence, resolve, reject, timer });
    });
  }

  public stop(): void {
    this.reset(new Error('Qianniu capture worker stopped'));
  }

  private ensureProcess(): void {
    if (this.process && !this.process.killed) return;
    const script = runtimePath('scripts', 'qianniu-compat-capture.ps1');
    const worker = spawn(
      'powershell.exe',
      buildQianniuCaptureWorkerArgs(script),
      {
        cwd: getRuntimeRoot(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    this.process = worker;
    this.stderrTail = '';
    const output = readline.createInterface({ input: worker.stdout! });
    output.on('line', (line) => this.handleLine(line));
    worker.stderr!.on('data', (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString('utf8')}`.slice(
        -2000,
      );
    });
    worker.on('error', (error) => this.reset(error));
    worker.on('exit', (code) => {
      if (this.process !== worker) return;
      const detail = this.stderrTail.trim();
      this.reset(
        new Error(
          `Qianniu capture worker exited (${code ?? 'unknown'})${
            detail ? `: ${detail}` : ''
          }`,
        ),
      );
    });
  }

  private handleLine(line: string): void {
    let payload: QianniuCaptureSnapshot | { error?: string };
    try {
      payload = JSON.parse(line) as QianniuCaptureSnapshot | { error?: string };
    } catch {
      return;
    }
    if ('error' in payload && payload.error) {
      const error = new Error(payload.error);
      for (const pending of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      return;
    }
    this.latest = reusePreviousQianniuRecognition(
      payload as QianniuCaptureSnapshot,
      this.latest,
    );
    this.sequence += 1;
    for (const pending of [...this.pending]) {
      if (this.sequence <= pending.afterSequence) continue;
      clearTimeout(pending.timer);
      this.pending.delete(pending);
      pending.resolve(this.latest);
    }
  }

  private reset(error?: Error): void {
    const worker = this.process;
    this.process = undefined;
    if (worker && !worker.killed) worker.kill();
    if (!error) return;
    for (const pending of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
