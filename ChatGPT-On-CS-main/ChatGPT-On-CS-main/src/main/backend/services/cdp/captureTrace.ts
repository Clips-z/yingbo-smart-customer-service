import { randomUUID } from 'crypto';

export type CaptureTraceStage =
  | 'customer_click'
  | 'context_update'
  | 'message_capture'
  | 'reply_start'
  | 'reply_complete'
  | 'draft_fill_start'
  | 'draft_fill_complete';

export interface CaptureTraceMark {
  stage: CaptureTraceStage;
  at: number;
}

export interface CaptureTraceSnapshot {
  traceId: string;
  marks: CaptureTraceMark[];
  elapsedMs: Partial<Record<CaptureTraceStage, number>>;
}

/** Lightweight in-memory trace for latency diagnosis. It never stores message text. */
export class CaptureTrace {
  private readonly marks: CaptureTraceMark[] = [];

  public readonly traceId: string;

  constructor(traceId = randomUUID()) {
    this.traceId = traceId;
  }

  public mark(stage: CaptureTraceStage, at = Date.now()): void {
    this.marks.push({ stage, at });
  }

  public snapshot(): CaptureTraceSnapshot {
    const elapsedMs: Partial<Record<CaptureTraceStage, number>> = {};
    const first = this.marks[0]?.at;
    if (first !== undefined) {
      for (const mark of this.marks) elapsedMs[mark.stage] = Math.max(0, mark.at - first);
    }
    return { traceId: this.traceId, marks: this.marks.slice(), elapsedMs };
  }
}
