/**
 * 安全存储工具 — 使用 Electron safeStorage API 加密敏感数据
 *
 * Windows: DPAPI (绑定用户账户)
 * macOS: Keychain
 * Linux: libsecret
 *
 * 用于加密数据库中的 API key / token 等敏感字段，
 * 即使 SQLite 文件被复制到其他机器也无法解密。
 */
import { safeStorage } from 'electron';

const ENCRYPTED_PREFIX = 'enc::';

/**
 * 判断 safeStorage 是否可用（某些 Linux 环境可能没有 libsecret）
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * 加密字符串。
 * 如果传入空字符串或 safeStorage 不可用，原样返回。
 */
export function encryptString(plainText: string): string {
  if (!plainText) return plainText;
  if (plainText.startsWith(ENCRYPTED_PREFIX)) return plainText; // 已加密
  if (!isEncryptionAvailable()) {
    console.warn('[SecureStorage] safeStorage 不可用，敏感数据将明文存储');
    return plainText;
  }
  try {
    const encrypted = safeStorage.encryptString(plainText);
    return ENCRYPTED_PREFIX + encrypted.toString('base64');
  } catch (e) {
    console.error('[SecureStorage] 加密失败:', e);
    return plainText;
  }
}

/**
 * 解密字符串。
 * 如果不是加密格式（无前缀），原样返回（兼容旧数据）。
 * 解密失败时返回原值，避免把数据库里的 key 清空。
 */
export function decryptString(value: string): string {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value;
  if (!isEncryptionAvailable()) {
    console.warn('[SecureStorage] safeStorage 不可用，无法解密，保留原值');
    return value;
  }
  try {
    const encrypted = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
    return safeStorage.decryptString(encrypted);
  } catch (e) {
    console.error('[SecureStorage] 解密失败，保留原值:', e);
    return value;
  }
}

/**
 * 判断字符串是否已加密
 */
export function isEncrypted(value: string): boolean {
  return !!value && value.startsWith(ENCRYPTED_PREFIX);
}

/** 需要加密的 Config 字段名 */
export const SENSITIVE_FIELDS = ['key', 'coze_token'] as const;
