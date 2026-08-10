import { evaluateAutomaticDelivery } from '../../main/backend/services/replySafetyPolicy';

describe('evaluateAutomaticDelivery', () => {
  it('allows reliable keyword replies and evidenced LLM replies', () => {
    expect(evaluateAutomaticDelivery({ safeToAutoSend: true, source: 'keyword', ocrConfidence: 0.95 })).toMatchObject({ allowed: true });
    expect(evaluateAutomaticDelivery({ safeToAutoSend: true, source: 'llm', retrievalStatus: 'hit', ocrConfidence: 0.95 })).toMatchObject({ allowed: true });
  });

  it('delivers completed replies without a second approval in unattended mode', () => {
    expect(evaluateAutomaticDelivery({ safeToAutoSend: false, source: 'llm', retrievalStatus: 'no_hit' })).toMatchObject({ allowed: true });
    expect(evaluateAutomaticDelivery({ safeToAutoSend: true, source: 'keyword', content: '保证到账' })).toMatchObject({ allowed: true });
    expect(evaluateAutomaticDelivery({ safeToAutoSend: true, source: 'keyword', ocrConfidence: 0.5 })).toMatchObject({ allowed: false, code: 'low_ocr_confidence' });
  });
});
