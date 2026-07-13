export type ReplyMode = 'hint' | 'assist' | 'unattended';

export type ReplySafetyDecision =
  | { allowed: true; mode: ReplyMode }
  | { allowed: false; code: 'unattended_not_enabled'; message: string };

export class ReplyModeDeniedError extends Error {
  readonly statusCode = 409;

  constructor(
    readonly code: 'unattended_not_enabled',
    message: string,
  ) {
    super(message);
    this.name = 'ReplyModeDeniedError';
  }
}

export function assertReplyModeAllowed(
  decision: ReplySafetyDecision,
): asserts decision is Extract<ReplySafetyDecision, { allowed: true }> {
  if (!decision.allowed) {
    throw new ReplyModeDeniedError(decision.code, decision.message);
  }
}

const SUPPORTED_PLATFORM_IDS = new Set([
  'win_wechat',
  'win_qianniu',
]);

const REPLY_MODES = new Set<ReplyMode>(['hint', 'assist', 'unattended']);

export function getDefaultReplyMode(platformId: string): ReplyMode {
  return SUPPORTED_PLATFORM_IDS.has(platformId) ? 'assist' : 'hint';
}

export function normalizeReplyMode(
  platformId: string,
  storedMode: unknown,
): ReplyMode {
  return typeof storedMode === 'string' &&
    REPLY_MODES.has(storedMode as ReplyMode)
    ? (storedMode as ReplyMode)
    : getDefaultReplyMode(platformId);
}

export function evaluateReplyModeChange(input: {
  platformId: string;
  requestedMode: ReplyMode;
  unattendedEnabled: boolean;
}): ReplySafetyDecision {
  if (input.requestedMode !== 'unattended') {
    return { allowed: true, mode: input.requestedMode };
  }

  if (!SUPPORTED_PLATFORM_IDS.has(input.platformId) || !input.unattendedEnabled) {
    return {
      allowed: false,
      code: 'unattended_not_enabled',
      message:
        '无人值守发送默认关闭。请在对应平台完成风险确认并启用后再试。',
    };
  }

  return { allowed: true, mode: 'unattended' };
}

export function getUnattendedConfigKey(platformId: string):
  | 'wechat_unattended_enabled'
  | 'qianniu_unattended_enabled'
  | undefined {
  if (platformId === 'win_wechat') return 'wechat_unattended_enabled';
  if (platformId === 'win_qianniu') return 'qianniu_unattended_enabled';
  return undefined;
}
