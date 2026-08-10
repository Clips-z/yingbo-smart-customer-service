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

  it('allows unattended delivery for a supported platform when the operator selects it', () => {
    expect(
      evaluateReplyModeChange({
        platformId: 'win_qianniu',
        requestedMode: 'unattended',
        unattendedEnabled: false,
      }),
    ).toEqual({ allowed: true, mode: 'unattended' });
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

  it('supports unattended delivery for WeCom', () => {
    expect(getDefaultReplyMode('win_wecom')).toBe('assist');
    expect(
      evaluateReplyModeChange({
        platformId: 'win_wecom',
        requestedMode: 'unattended',
        unattendedEnabled: true,
      }),
    ).toEqual({ allowed: true, mode: 'unattended' });
  });

  it('still rejects unattended delivery for unsupported platforms', () => {
    const decision = evaluateReplyModeChange({
      platformId: 'win_pdd',
      requestedMode: 'unattended',
      unattendedEnabled: true,
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
