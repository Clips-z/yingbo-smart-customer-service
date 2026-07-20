import { replaySanitizedFixtures } from '../../main/backend/services/replayService';

describe('sanitized platform replay', () => {
  it('replays safety outcomes without screenshots or personal data', () => {
    const result = replaySanitizedFixtures([
      { platformId: 'win_qianniu', source: 'llm', retrievalStatus: 'hit', ocrConfidence: 0.95, expectedAllowed: true },
      { platformId: 'win_wechat', source: 'llm', retrievalStatus: 'no_hit', ocrConfidence: 0.95, expectedAllowed: false },
    ]);
    expect(result.map((row) => row.passed)).toEqual([true, true]);
  });
});
