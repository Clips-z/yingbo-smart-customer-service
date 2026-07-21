import { redactAuditPayload, redactPersonalData } from '../../main/backend/services/privacyService';

describe('privacy service', () => {
  it('redacts phone, email, and account-like values before derived knowledge or audit storage', () => {
    const input = '联系 13800138000，邮箱 test@example.com，卡号 6222 1234 5678 9012';
    expect(redactPersonalData(input)).toBe('联系 [手机号]，邮箱 [邮箱]，卡号 [账号]');
    expect(redactAuditPayload({ note: input, count: 1 })).toEqual({ note: '联系 [手机号]，邮箱 [邮箱]，卡号 [账号]', count: 1 });
  });
});
