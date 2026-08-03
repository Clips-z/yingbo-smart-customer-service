import { CaptureTrace } from '../../../main/backend/services/cdp/captureTrace';

describe('CaptureTrace', () => {
  test('creates a trace without retaining customer content', () => {
    const trace = new CaptureTrace('trace-1');
    trace.mark('customer_click', 1000);
    trace.mark('context_update', 1125);
    trace.mark('message_capture', 1300);

    expect(trace.snapshot()).toEqual({
      traceId: 'trace-1',
      marks: [
        { stage: 'customer_click', at: 1000 },
        { stage: 'context_update', at: 1125 },
        { stage: 'message_capture', at: 1300 },
      ],
      elapsedMs: { customer_click: 0, context_update: 125, message_capture: 300 },
    });
    expect(JSON.stringify(trace.snapshot())).not.toContain('customer message');
  });
});
