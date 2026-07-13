import { createIncomingMessageFingerprint } from '../../main/backend/services/incomingMessageFingerprint';

describe('createIncomingMessageFingerprint', () => {
  const message = {
    platformId: 'win_qianniu',
    chatFingerprint: 'chat-123',
    sender: 'buyer-1',
    content: '请问什么时候发货？',
  };

  it('is stable for the same incoming event', () => {
    expect(createIncomingMessageFingerprint(message)).toBe(
      createIncomingMessageFingerprint({ ...message }),
    );
  });

  it('allows the same text in a different chat', () => {
    expect(createIncomingMessageFingerprint(message)).not.toBe(
      createIncomingMessageFingerprint({
        ...message,
        chatFingerprint: 'chat-456',
      }),
    );
  });

  it('does not merge messages from different platforms', () => {
    expect(createIncomingMessageFingerprint(message)).not.toBe(
      createIncomingMessageFingerprint({
        ...message,
        platformId: 'win_wechat',
      }),
    );
  });

  it('normalizes OCR whitespace without changing the message identity', () => {
    expect(
      createIncomingMessageFingerprint({
        ...message,
        sender: '  buyer-1  ',
        content: '  请问\r\n  什么时候发货？  ',
      }),
    ).toBe(
      createIncomingMessageFingerprint({
        ...message,
        content: '请问 什么时候发货？',
      }),
    );
  });
});
