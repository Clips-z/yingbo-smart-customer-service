import { normalizePlatformHealthError } from '../../main/backend/services/platformHealth';

describe('normalizePlatformHealthError', () => {
  it.each([
    ['千牛未启动', 'client_not_running'],
    ['微信未登录', 'not_logged_in'],
    ['会话窗口未找到', 'window_not_found'],
    ['OCR 不可用', 'ocr_unavailable'],
    ['OCR 置信度过低', 'ocr_low_confidence'],
    ['定位超时', 'send_timeout'],
    ['发送失败', 'send_failed'],
  ])('maps %s to %s with a recovery action', (message, reasonCode) => {
    expect(normalizePlatformHealthError(message)).toEqual({
      reasonCode,
      recoveryAction: expect.any(String),
    });
  });

  it('does not invent an error for a healthy platform', () => {
    expect(normalizePlatformHealthError()).toEqual({});
  });
});
