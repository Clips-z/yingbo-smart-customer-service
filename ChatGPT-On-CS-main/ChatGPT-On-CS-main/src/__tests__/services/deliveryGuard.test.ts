jest.mock('../../main/backend/entities/replySuggestion', () => ({
  ReplySuggestion: { update: jest.fn() },
}));

import { ReplySuggestion } from '../../main/backend/entities/replySuggestion';
import {
  cancelQueuedUnattendedDeliveries,
  finishSuggestionDelivery,
  reserveSuggestionDelivery,
} from '../../main/backend/services/deliveryGuard';

const update = ReplySuggestion.update as jest.Mock;

describe('deliveryGuard', () => {
  beforeEach(() => update.mockReset());

  it('atomically reserves only pending or failed suggestions', async () => {
    update.mockResolvedValue([1]);
    const requestId = await reserveSuggestionDelivery(7, 'prepare');
    expect(requestId).toEqual(expect.any(String));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'preparing', delivery_request_id: requestId }),
      { where: { id: 7, status: ['pending', 'failed'] } },
    );
  });

  it('rejects a duplicate click when the reservation is already taken', async () => {
    update.mockResolvedValue([0]);
    await expect(reserveSuggestionDelivery(7, 'prepare')).rejects.toMatchObject({
      code: 'delivery_already_reserved',
      statusCode: 409,
    });
  });

  it('ignores a completion carrying a mismatched request id', async () => {
    update.mockResolvedValue([0]);
    await expect(
      finishSuggestionDelivery({ id: 7, requestId: 'stale', status: 'prepared' }),
    ).resolves.toBe(false);
    expect(update.mock.calls[0][1].where).toEqual({
      id: 7,
      delivery_request_id: 'stale',
      status: ['preparing', 'sending'],
    });
  });

  it('cancels queued unattended deliveries on emergency stop', async () => {
    update.mockResolvedValue([3]);
    await expect(cancelQueuedUnattendedDeliveries('win_qianniu')).resolves.toBe(3);
    expect(update.mock.calls[0][1]).toEqual({
      where: { platform_id: 'win_qianniu', status: 'sending' },
    });
  });
});
