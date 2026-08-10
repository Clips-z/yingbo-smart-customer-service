import {
  customerIdentity,
  normalizedQianniuCustomerId,
  receptionStatusLabel,
  selectReceptionRows,
  storeLabel,
} from '../../renderer/main-window/components/compactReceptionModel';
import { ReplySuggestion } from '../../renderer/common/services/platform/platform';

function suggestion(values: Partial<ReplySuggestion>): ReplySuggestion {
  return {
    id: 1,
    platform_id: 'win_qianniu',
    store: 'wheeltech旗舰店',
    sender: '未知客户',
    incoming_content: '您好',
    reply_content: '您好，请问有什么可以帮助您？',
    status: 'pending',
    created_at: '2026-08-03T10:00:00.000Z',
    updated_at: '2026-08-03T10:00:00.000Z',
    ...values,
  };
}

describe('compact reception customer identity', () => {
  it('repairs the store name OCR suffix used by existing rows', () => {
    expect(storeLabel('wheeltech 牌 店')).toBe('wheeltech旗舰店');
    expect(storeLabel('wheeltech 品牌店')).toBe('wheeltech品牌店');
  });

  it('prefers a stable customer id', () => {
    expect(
      customerIdentity(
        suggestion({ contact_id: 'tb58295449840', sender: '生涯多么美好' }),
      ),
    ).toEqual({ label: 'tb58295449840', reliable: true });
  });

  it('repairs numeric customer IDs before displaying existing OCR rows', () => {
    expect(normalizedQianniuCustomerId('tb7S931S6200')).toBe('tb7593156200');
    expect(
      customerIdentity(
        suggestion({ contact_id: 'tb7S931S6200', sender: 'tb7S931S6200' }),
      ),
    ).toEqual({ label: 'tb7593156200', reliable: true });
  });

  it('does not present OCR conversation text as a customer id', () => {
    expect(customerIdentity(suggestion({ sender: '智能小车配件偏好' }))).toEqual({
      label: '客户 ID 待确认',
      reliable: false,
    });
    expect(customerIdentity(suggestion({ sender: 'yzg1005boi\\v' })).reliable).toBe(false);
  });

  it('uses visible contact names as identities outside QianNiu', () => {
    expect(
      customerIdentity(
        suggestion({
          platform_id: 'win_wechat',
          store_id: 'win_wechat',
          contact_id: '养基宝用户交流群（209）Q',
        }),
      ),
    ).toEqual({ label: '养基宝用户交流群（209）Q', reliable: true });
    expect(storeLabel('win_wechat')).toBe('');
  });

  it('keeps only the newest pending row for the same customer', () => {
    const rows = selectReceptionRows(
      [
        suggestion({ id: 1, contact_id: 'tb12345', created_at: '2026-08-03T09:00:00.000Z' }),
        suggestion({ id: 2, contact_id: 'tb12345', created_at: '2026-08-03T10:00:00.000Z' }),
      ],
      true,
    );
    expect(rows.map((item) => item.id)).toEqual([2]);
  });

  it('collapses multiple OCR aliases when no customer id is trustworthy', () => {
    const rows = selectReceptionRows(
      [
        suggestion({ id: 1, sender: '生涯多么美好' }),
        suggestion({ id: 2, sender: '智能小车配件偏好' }),
      ],
      true,
    );
    expect(rows).toHaveLength(1);
  });

  it('does not resurrect an older pending row after the customer was replied', () => {
    const rows = selectReceptionRows(
      [
        suggestion({ id: 1, contact_id: 'tb12345', status: 'pending', created_at: '2026-08-03T09:00:00.000Z' }),
        suggestion({ id: 2, contact_id: 'tb12345', status: 'sent', created_at: '2026-08-03T10:00:00.000Z' }),
      ],
      'manual',
    );
    expect(rows).toEqual([]);
  });

  it('keeps a filled draft in the manual queue until it is actually sent', () => {
    const rows = selectReceptionRows(
      [suggestion({ id: 3, contact_id: 'tb23456', status: 'prepared' })],
      'manual',
    );
    expect(rows.map((item) => item.id)).toEqual([3]);
  });

  it('separates automatic and manual reply labels', () => {
    expect(receptionStatusLabel(suggestion({ status: 'sent' }))).toBe('人工已回复');
    expect(
      receptionStatusLabel(suggestion({ status: 'sent', delivery_request_id: 'request-1' })),
    ).toBe('自动已回复');
  });

  it('excludes dismissed conversations from all', () => {
    expect(
      selectReceptionRows(
        [suggestion({ contact_id: 'tb34567', status: 'dismissed' })],
        'all',
      ),
    ).toEqual([]);
  });
});
