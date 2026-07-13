import {
  assertReplyModeAllowed,
  evaluateReplyModeChange,
  getDefaultReplyMode,
  getUnattendedConfigKey,
  normalizeReplyMode,
} from '../../main/backend/services/replySafetyPolicy';

describe('replySafetyPolicy', () => {
  it('defaults the two supported platforms to assist mode', () => {
    expect(getDefaultReplyMode('win_wechat')).toBe('assist');
    expect(getDefaultReplyMode('win_qianniu')).toBe('assist');
    expect(getDefaultReplyMode('win_pdd')).toBe('hint');
  });

  it('allows hint and assist without enabling autonomous delivery', () => {
    expect(
      evaluateReplyModeChange({
        platformId: 'win_wechat',
        requestedMode: 'assist',
        unattendedEnabled: false,
      }),
    ).toEqual({ allowed: true, mode: 'assist' });
  });

  it('rejects unattended delivery until the platform is explicitly unlocked', () => {
    expect(
      evaluateReplyModeChange({
        platformId: 'win_qianniu',
        requestedMode: 'unattended',
        unattendedEnabled: false,
      }),
    ).toMatchObject({
      allowed: false,
      code: 'unattended_not_enabled',
    });
  });

  it('does not permit unattended delivery for unsupported platforms', () => {
    expect(
      evaluateReplyModeChange({
        platformId: 'win_pdd',
        requestedMode: 'unattended',
        unattendedEnabled: true,
      }),
    ).toMatchObject({ allowed: false });
  });

  it('uses only supported-platform unlock keys', () => {
    expect(getUnattendedConfigKey('win_wechat')).toBe(
      'wechat_unattended_enabled',
    );
    expect(getUnattendedConfigKey('win_qianniu')).toBe(
      'qianniu_unattended_enabled',
    );
    expect(getUnattendedConfigKey('win_pdd')).toBeUndefined();
  });

  it.each([undefined, null, '', 'auto', 'manual']) (
    'normalizes an invalid stored mode (%p) to the safe platform default',
    (storedMode) => {
      expect(normalizeReplyMode('win_wechat', storedMode)).toBe('assist');
      expect(normalizeReplyMode('win_qianniu', storedMode)).toBe('assist');
      expect(normalizeReplyMode('win_pdd', storedMode)).toBe('hint');
    },
  );

  it('keeps valid safe modes unchanged', () => {
    expect(normalizeReplyMode('win_wechat', 'hint')).toBe('hint');
    expect(normalizeReplyMode('win_qianniu', 'assist')).toBe('assist');
  });

  it('does not treat WeCom as an unattended-supported production platform', () => {
    expect(getDefaultReplyMode('win_wecom')).toBe('hint');
    expect(
      evaluateReplyModeChange({
        platformId: 'win_wecom',
        requestedMode: 'unattended',
        unattendedEnabled: true,
      }),
    ).toMatchObject({ allowed: false });
  });

  it('throws a structured denial that API routes can return safely', () => {
    const decision = evaluateReplyModeChange({
      platformId: 'win_qianniu',
      requestedMode: 'unattended',
      unattendedEnabled: false,
    });
    expect(() => assertReplyModeAllowed(decision)).toThrow(
      expect.objectContaining({
        name: 'ReplyModeDeniedError',
        code: 'unattended_not_enabled',
        statusCode: 409,
      }),
    );
  });
});
