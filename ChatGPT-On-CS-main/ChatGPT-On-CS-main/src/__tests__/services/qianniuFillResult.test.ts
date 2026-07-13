import {
  assertQianniuFillResult,
  parseQianniuFillResult,
} from '../../main/backend/services/qianniuFillResult';

describe('Qianniu fill result', () => {
  it('parses the last structured line from PowerShell', () => {
    expect(
      parseQianniuFillResult('diagnostic\n{"success":true,"selected":true,"filled":false,"submitted":false}'),
    ).toMatchObject({ success: true, selected: true, submitted: false });
  });

  it('rejects selection without an explicit selected flag', () => {
    const result = parseQianniuFillResult('{"success":true,"submitted":false}');
    expect(() => assertQianniuFillResult(result, 'select', false)).toThrow('未确认选中');
  });

  it('requires assist fill to be filled but never submitted', () => {
    const safe = parseQianniuFillResult(
      '{"success":true,"selected":true,"filled":true,"submitted":false}',
    );
    expect(() => assertQianniuFillResult(safe, 'fill', false)).not.toThrow();
    const unsafe = { ...safe, submitted: true };
    expect(() => assertQianniuFillResult(unsafe, 'fill', false)).toThrow('提交状态');
  });

  it('rejects invalid or unsuccessful script output', () => {
    expect(() => parseQianniuFillResult('not-json')).toThrow('无效结果');
    const result = parseQianniuFillResult(
      '{"success":false,"errorCode":"window_not_found","error":"missing"}',
    );
    expect(() => assertQianniuFillResult(result, 'fill', false)).toThrow('missing');
  });
});
