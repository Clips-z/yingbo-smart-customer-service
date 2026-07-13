import crypto from 'crypto';

export function createIncomingMessageFingerprint(input: {
  platformId: string;
  chatFingerprint: string;
  sender: string;
  content: string;
}): string {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
  const normalized = [
    normalize(input.platformId),
    normalize(input.chatFingerprint),
    normalize(input.sender),
    normalize(input.content),
  ].join('\n');

  return crypto.createHash('sha256').update(normalized).digest('hex');
}
