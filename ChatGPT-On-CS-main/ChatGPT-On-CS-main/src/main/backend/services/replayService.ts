import { evaluateAutomaticDelivery, getMinimumOcrConfidence } from './replySafetyPolicy';

export function replaySanitizedFixtures(fixtures: any[]) {
  return (Array.isArray(fixtures) ? fixtures : []).slice(0, 500).map((fixture, index) => {
    const platformId = String(fixture.platformId || 'win_qianniu');
    const decision = evaluateAutomaticDelivery({
      safeToAutoSend: fixture.safeToAutoSend !== false,
      source: String(fixture.source || 'llm'),
      retrievalStatus: String(fixture.retrievalStatus || 'no_hit'),
      ocrConfidence: Number(fixture.ocrConfidence),
      minimumOcrConfidence: getMinimumOcrConfidence(platformId),
      conversationStable: fixture.conversationStable !== false,
      content: String(fixture.content || '').slice(0, 300),
    });
    const expectedAllowed = fixture.expectedAllowed === true;
    return {
      index,
      platformId,
      expectedAllowed,
      actualAllowed: decision.allowed,
      passed: decision.allowed === expectedAllowed,
      reason: decision.allowed ? 'allowed' : decision.code,
    };
  });
}
