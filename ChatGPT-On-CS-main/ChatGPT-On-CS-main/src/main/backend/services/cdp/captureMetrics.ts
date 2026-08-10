export type CaptureMetricName =
  | 'context_switch'
  | 'incoming_message'
  | 'ocr_capture'
  | 'reply_generation'
  | 'draft_fill';

export interface CaptureMetricSample {
  name: CaptureMetricName;
  durationMs: number;
  ok: boolean;
  source: 'cdp' | 'ocr' | 'unknown';
  capturedAt: string;
}

export interface CaptureMetricsSnapshot {
  counts: Record<CaptureMetricName, number>;
  failures: Record<CaptureMetricName, number>;
  p50Ms: Partial<Record<CaptureMetricName, number>>;
  p95Ms: Partial<Record<CaptureMetricName, number>>;
  recent: CaptureMetricSample[];
}

const METRIC_NAMES: CaptureMetricName[] = [
  'context_switch',
  'incoming_message',
  'ocr_capture',
  'reply_generation',
  'draft_fill',
];

export class CaptureMetrics {
  private readonly samples: CaptureMetricSample[] = [];

  constructor(private readonly maxSamples = 500) {}

  public record(sample: Omit<CaptureMetricSample, 'capturedAt'> & { capturedAt?: string }): void {
    this.samples.push({ ...sample, capturedAt: sample.capturedAt || new Date().toISOString() });
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }

  public snapshot(): CaptureMetricsSnapshot {
    const counts = Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])) as Record<CaptureMetricName, number>;
    const failures = Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])) as Record<CaptureMetricName, number>;
    const p50Ms: Partial<Record<CaptureMetricName, number>> = {};
    const p95Ms: Partial<Record<CaptureMetricName, number>> = {};
    for (const name of METRIC_NAMES) {
      const values = this.samples.filter((sample) => sample.name === name);
      counts[name] = values.length;
      failures[name] = values.filter((sample) => !sample.ok).length;
      if (values.length) {
        const durations = values.map((sample) => sample.durationMs).sort((a, b) => a - b);
        p50Ms[name] = percentile(durations, 0.5);
        p95Ms[name] = percentile(durations, 0.95);
      }
    }
    return { counts, failures, p50Ms, p95Ms, recent: this.samples.slice(-50) };
  }

  public reset(): void {
    this.samples.length = 0;
  }
}

function percentile(values: number[], ratio: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return Math.round(values[index]);
}
