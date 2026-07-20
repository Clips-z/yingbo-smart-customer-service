import {
  evaluateAutomaticDelivery,
  getMinimumOcrConfidence,
} from '../../main/backend/services/replySafetyPolicy';

describe('OCR confidence gate', () => {
  it('uses explicit per-platform thresholds', () => {
    expect(getMinimumOcrConfidence('win_qianniu')).toBe(0.88);
    expect(getMinimumOcrConfidence('win_wechat')).toBe(0.85);
    expect(getMinimumOcrConfidence('win_wecom')).toBe(0.85);
  });

  it('blocks low-confidence and ambiguous conversations from unattended delivery', () => {
    expect(evaluateAutomaticDelivery({
      safeToAutoSend: true,
      source: 'keyword',
      ocrConfidence: 0.84,
      minimumOcrConfidence: 0.85,
      conversationStable: true,
    })).toMatchObject({ allowed: false, code: 'low_ocr_confidence' });
    expect(evaluateAutomaticDelivery({
      safeToAutoSend: true,
      source: 'keyword',
      ocrConfidence: 0.95,
      conversationStable: false,
    })).toMatchObject({ allowed: false, code: 'ambiguous_conversation' });
  });
});
