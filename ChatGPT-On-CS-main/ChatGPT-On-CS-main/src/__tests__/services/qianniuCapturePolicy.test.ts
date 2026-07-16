import {
  evaluateQianniuCapture,
  normalizeQianniuContact,
} from '../../main/backend/services/qianniuCapturePolicy';

const validCapture = {
  sender: 'tbBuyer12345',
  content: '请问今天可以发货吗？',
  direction: 'incoming',
  latestDirection: 'incoming',
  confidence: 0.97,
  ocrEngine: 'rapidocr',
};

describe('evaluateQianniuCapture', () => {
  it('normalizes read markers and rejects panel URLs as contacts', () => {
    expect(normalizeQianniuContact('打开keil5 已读')).toBe('打开keil5');
    expect(normalizeQianniuContact('https://detail.tmall.com/item.htm...')).toBe('');
  });

  it('accepts a confident incoming buyer message', () => {
    expect(evaluateQianniuCapture(validCapture, 0.88)).toEqual({
      accepted: true,
      sender: 'tbBuyer12345',
      content: '请问今天可以发货吗？',
    });
  });

  it.each([
    [{ ...validCapture, sender: '' }, 'sender_missing'],
    [{ ...validCapture, content: '好' }, 'content_too_short'],
    [{ ...validCapture, direction: 'unknown' }, 'not_incoming'],
    [{ ...validCapture, latestDirection: 'outgoing' }, 'latest_not_incoming'],
    [{ ...validCapture, ocrEngine: 'windows' }, 'ocr_unavailable'],
    [{ ...validCapture, confidence: 0.5 }, 'ocr_low_confidence'],
    [{ ...validCapture, content: '乱码�消息' }, 'invalid_text'],
    [{ ...validCapture, content: '2026-07-12 12:00' }, 'metadata_text'],
    [{ ...validCapture, content: 'tbBuyer123452026' }, 'metadata_text'],
    [{ ...validCapture, content: '已读' }, 'metadata_text'],
    [
      { ...validCapture, content: '买家30天内主动沟通后，您才能给买家发消息' },
      'metadata_text',
    ],
    [{ ...validCapture, content: '由 richard 转交给 jamie' }, 'metadata_text'],
    [{ ...validCapture, content: '机器人自动回充 ¥4499.0' }, 'metadata_text'],
    [{ ...validCapture, content: '当前用户来自商品详情页' }, 'metadata_text'],
    [{ ...validCapture, content: '月销0' }, 'metadata_text'],
  ])('rejects unsafe capture as %s', (input, reasonCode) => {
    expect(evaluateQianniuCapture(input, 0.88)).toEqual({
      accepted: false,
      reasonCode,
    });
  });
});
