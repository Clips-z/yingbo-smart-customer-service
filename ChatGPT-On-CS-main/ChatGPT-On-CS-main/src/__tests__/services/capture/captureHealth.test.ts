import { CaptureHealth } from '../../../main/backend/services/capture/captureHealth';

describe('CaptureHealth', () => {
  test('reports stale state when no event arrives within the threshold', () => {
    const health = new CaptureHealth(1000);
    health.event(1000);
    expect(health.snapshot('ocr', 'ocr-active', 1900).stale).toBe(false);
    expect(health.snapshot('ocr', 'ocr-active', 2001).stale).toBe(true);
  });
});
