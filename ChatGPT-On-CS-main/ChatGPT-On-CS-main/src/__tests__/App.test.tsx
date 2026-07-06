import { isVersionGreater } from '../renderer/common/services/system/controller';

describe('Version comparison', () => {
  test('detects a newer patch version', () => {
    expect(isVersionGreater('1.0.1', '1.0.0')).toBe(true);
  });

  test('does not treat the same version as newer', () => {
    expect(isVersionGreater('1.0.0', '1.0.0')).toBe(false);
  });

  test('treats a stable release as newer than its beta', () => {
    expect(isVersionGreater('1.0.0', '1.0.0-beta.1')).toBe(true);
  });
});
