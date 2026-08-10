import { CaptureMetrics } from '../../../main/backend/services/cdp/captureMetrics';

describe('CaptureMetrics', () => {
  test('reports counts, failures and percentiles per metric', () => {
    const metrics = new CaptureMetrics();
    metrics.record({ name: 'context_switch', durationMs: 100, ok: true, source: 'ocr' });
    metrics.record({ name: 'context_switch', durationMs: 300, ok: false, source: 'ocr' });
    metrics.record({ name: 'context_switch', durationMs: 200, ok: true, source: 'cdp' });

    const snapshot = metrics.snapshot();
    expect(snapshot.counts.context_switch).toBe(3);
    expect(snapshot.failures.context_switch).toBe(1);
    expect(snapshot.p50Ms.context_switch).toBe(200);
    expect(snapshot.p95Ms.context_switch).toBe(300);
  });

  test('keeps the recent sample buffer bounded', () => {
    const metrics = new CaptureMetrics(2);
    for (let index = 0; index < 3; index += 1) {
      metrics.record({ name: 'ocr_capture', durationMs: index, ok: true, source: 'ocr' });
    }
    expect(metrics.snapshot().recent).toHaveLength(2);
  });
});
