import {
  buildQianniuCaptureWorkerArgs,
  QianniuCaptureSnapshot,
  reusePreviousQianniuRecognition,
} from '../../main/backend/services/qianniuCaptureWorker';

function snapshot(
  overrides: Partial<QianniuCaptureSnapshot> = {},
): QianniuCaptureSnapshot {
  return {
    hwnd: 1,
    width: 100,
    height: 100,
    image: 'capture.png',
    chat_fingerprint: 'chat-a',
    qianniu_foreground: false,
    click_performed: false,
    tab_alert_x: [],
    conversation_alerts: [],
    candidate: {
      sender: '',
      content: '',
      confidence: 0,
      direction: 'unknown',
      latest_direction: 'unknown',
      bubble_blue_bias: 0,
      lowest_outgoing_y: 0,
      x: 0,
      y: 0,
    },
    ocr_engine: 'none',
    lines: [],
    ...overrides,
  };
}

describe('buildQianniuCaptureWorkerArgs', () => {
  it('keeps Windows OCR warm while the script skips unchanged fingerprints', () => {
    const args = buildQianniuCaptureWorkerArgs('C:\\runtime\\qianniu-capture.ps1');

    expect(args).toContain('-WindowsOcrOnly');
    expect(args).not.toContain('-SkipOcr');
    expect(args).toEqual(
      expect.arrayContaining(['-Watch', '-IntervalMs', '150']),
    );
  });

  it('reuses recognition only for an unchanged fingerprint', () => {
    const recognized = snapshot({
      ocr_engine: 'windows',
      candidate: {
        ...snapshot().candidate,
        sender: 'buyer-a',
        content: '什么时候发货',
        confidence: 0.95,
        direction: 'incoming',
      },
      lines: [{ text: '什么时候发货', score: 0, x: 10, y: 20, width: 80, height: 20 }],
    });

    expect(reusePreviousQianniuRecognition(snapshot(), recognized)).toMatchObject({
      ocr_engine: 'windows',
      candidate: { sender: 'buyer-a', content: '什么时候发货' },
    });
    expect(
      reusePreviousQianniuRecognition(
        snapshot({ chat_fingerprint: 'chat-b' }),
        recognized,
      ).ocr_engine,
    ).toBe('none');
  });
});
