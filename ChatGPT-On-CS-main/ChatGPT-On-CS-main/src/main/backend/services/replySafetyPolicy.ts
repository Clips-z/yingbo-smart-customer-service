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

export type AutomaticDeliveryDecision =
  | { allowed: true; riskLevel: 'low' }
  | {
      allowed: false;
      riskLevel: 'medium' | 'high';
      code: 'unsafe_source' | 'low_ocr_confidence' | 'ambiguous_conversation' | 'insufficient_evidence' | 'high_risk_content';
    };

export function evaluateAutomaticDelivery(input: {
  safeToAutoSend?: boolean;
  source?: string;
  retrievalStatus?: string;
  ocrConfidence?: number;
  minimumOcrConfidence?: number;
  content?: string;
  conversationStable?: boolean;
}): AutomaticDeliveryDecision {
  if (!input.safeToAutoSend) return { allowed: false, riskLevel: 'medium', code: 'unsafe_source' };
  if (input.conversationStable === false) {
    return { allowed: false, riskLevel: 'medium', code: 'ambiguous_conversation' };
  }
  if (
    input.ocrConfidence != null &&
    input.ocrConfidence < (input.minimumOcrConfidence ?? 0.88)
  ) {
    return { allowed: false, riskLevel: 'medium', code: 'low_ocr_confidence' };
  }
  if (/(已退款|一定赔偿|保证到账|百分百|绝对可以|无需审核)/.test(input.content || '')) {
    return { allowed: false, riskLevel: 'high', code: 'high_risk_content' };
  }
  if (
    !['keyword', 'plugin'].includes(input.source || '') &&
    input.retrievalStatus !== 'hit'
  ) {
    return { allowed: false, riskLevel: 'medium', code: 'insufficient_evidence' };
  }
  return { allowed: true, riskLevel: 'low' };
}

export function getMinimumOcrConfidence(platformId: string): number {
  if (platformId === 'win_qianniu') return Number(process.env.QIANNIU_OCR_MIN_CONFIDENCE || 0.88);
  if (platformId === 'win_wechat') return Number(process.env.WECHAT_OCR_MIN_CONFIDENCE || 0.85);
  if (platformId === 'win_wecom') return Number(process.env.WECOM_OCR_MIN_CONFIDENCE || 0.85);
  return 0.9;
}
