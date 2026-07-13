import crypto from 'crypto';
import { ReplySuggestion, ReplySuggestionStatus } from '../entities/replySuggestion';

export type DeliveryAction = 'prepare' | 'send';

const RESERVABLE_STATUSES: ReplySuggestionStatus[] = ['pending', 'failed'];

export class DeliveryConflictError extends Error {
  readonly code = 'delivery_already_reserved';

  readonly statusCode = 409;
}

export async function reserveSuggestionDelivery(
  id: number,
  action: DeliveryAction,
): Promise<string> {
  const requestId = crypto.randomUUID();
  const status: ReplySuggestionStatus =
    action === 'send' ? 'sending' : 'preparing';
  const [updated] = await ReplySuggestion.update(
    {
      status,
      delivery_request_id: requestId,
      delivery_error: null,
      updated_at: new Date(),
    },
    { where: { id, status: RESERVABLE_STATUSES } },
  );
  if (updated !== 1) {
    throw new DeliveryConflictError('该回复正在处理或已经完成，请勿重复操作');
  }
  return requestId;
}

export async function finishSuggestionDelivery(input: {
  id: number;
  requestId: string;
  status: Extract<ReplySuggestionStatus, 'prepared' | 'sent' | 'failed' | 'cancelled'>;
  error?: string;
}): Promise<boolean> {
  const [updated] = await ReplySuggestion.update(
    {
      status: input.status,
      delivery_error: input.error?.slice(0, 500) || null,
      updated_at: new Date(),
    },
    {
      where: {
        id: input.id,
        delivery_request_id: input.requestId,
        status: ['preparing', 'sending'],
      },
    },
  );
  return updated === 1;
}

export async function cancelQueuedUnattendedDeliveries(
  platformId: string,
): Promise<number> {
  const [updated] = await ReplySuggestion.update(
    {
      status: 'cancelled',
      delivery_error: '用户已紧急停止自动投递',
      updated_at: new Date(),
    },
    { where: { platform_id: platformId, status: 'sending' } },
  );
  return updated;
}
