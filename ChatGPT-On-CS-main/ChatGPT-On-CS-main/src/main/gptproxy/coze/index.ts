import crypto from 'crypto';
import {
  APIError,
  ChatStatus,
  CozeAPI,
  COZE_CN_BASE_URL,
  RoleType,
} from '@coze/api';

export interface CozeAIOptions {
  apiKey: string;
  baseURL?: string;
  botId: string;
  userId?: string;
  timeout?: number;
}

type CompletionParams = {
  messages: Array<{ role: string; content: string }>;
  user?: string;
};

const MAX_CONTEXT_MESSAGES = 24;
const MAX_CONTEXT_CHARACTERS = 16_000;

export const limitCozeConversation = (
  source: CompletionParams['messages'],
  maxMessages = MAX_CONTEXT_MESSAGES,
  maxCharacters = MAX_CONTEXT_CHARACTERS,
) => {
  const normalized = source
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({ ...message, content: message.content.trim() }))
    .filter((message) => message.content);
  const selected: CompletionParams['messages'] = [];
  let characterCount = 0;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (selected.length >= maxMessages) break;
    const message = normalized[index];
    const remaining = maxCharacters - characterCount;
    if (remaining <= 0) break;
    if (message.content.length > remaining) {
      if (!selected.length) {
        selected.unshift({
          ...message,
          content: message.content.slice(0, remaining),
        });
      }
      break;
    }
    selected.unshift(message);
    characterCount += message.content.length;
  }

  while (selected[0]?.role === 'assistant') selected.shift();
  return selected;
};

export const formatCozeError = (error: unknown) => {
  if (!(error instanceof APIError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const messages: Record<number, string> = {
    400: 'Coze 请求参数有误，请检查智能体 ID，并确认已发布到 API 渠道',
    401: 'Coze Token 无效或已过期，请重新创建 Personal Access Token',
    403: 'Coze 拒绝访问，请检查 Token 权限以及智能体是否已发布到 API 渠道',
    404: '找不到该 Coze 智能体，请检查智能体 ID 和所属空间权限',
    408: 'Coze 回复超时，请稍后重试',
    429: 'Coze 请求过于频繁或额度不足，请稍后重试并检查额度',
    500: 'Coze 服务暂时异常，请稍后重试',
    502: 'Coze 网关暂时异常，请稍后重试',
  };
  const friendlyMessage = error.status
    ? messages[error.status]
    : '无法连接 Coze，请检查网络和 API 地址';
  const logId = error.logid ? `（Log ID：${error.logid}）` : '';
  return `${friendlyMessage || error.msg || error.message}${logId}`;
};

const completionStream = (content: string) =>
  (async function* stream() {
    yield { choices: [{ delta: { content } }] };
  })();

export class CozeAI {
  private client: CozeAPI;

  private botId: string;

  private userId: string;

  private timeout: number;

  public chat: {
    completions: {
      create: (params: CompletionParams) => Promise<AsyncIterable<unknown>>;
    };
  };

  constructor(options: CozeAIOptions) {
    if (!options.apiKey) throw new Error('请填写 Coze Personal Access Token');
    if (!options.botId) throw new Error('请填写 Coze Bot ID');
    this.client = new CozeAPI({
      token: options.apiKey,
      baseURL: options.baseURL || COZE_CN_BASE_URL,
    });
    this.botId = options.botId;
    this.userId = options.userId || 'lazy-customer-service';
    this.timeout = options.timeout || 20_000;
    this.chat = {
      completions: {
        create: (params) => this.createCompletion(params),
      },
    };
  }

  private async createCompletion(
    params: CompletionParams,
  ): Promise<AsyncIterable<unknown>> {
    const messages = limitCozeConversation(params.messages).map((message) => ({
      role: message.role === 'assistant' ? RoleType.Assistant : RoleType.User,
      type:
        message.role === 'assistant'
          ? ('answer' as const)
          : ('question' as const),
      content: message.content,
      content_type: 'text' as const,
    }));
    if (!messages.length) throw new Error('没有可发送给 Coze 的消息');

    const customerKey = params.user || this.userId;
    const customerHash = crypto
      .createHash('sha256')
      .update(customerKey)
      .digest('hex')
      .slice(0, 24);
    let result;
    try {
      result = await this.client.chat.createAndPoll(
        {
          bot_id: this.botId,
          user_id: `${this.userId.slice(0, 24)}-${customerHash}`,
          auto_save_history: false,
          additional_messages: messages,
        },
        { timeout: this.timeout },
      );
    } catch (error) {
      throw new Error(formatCozeError(error));
    }
    if (result.chat.status !== ChatStatus.COMPLETED) {
      throw new Error(
        result.chat.last_error?.msg || `Coze 回复失败：${result.chat.status}`,
      );
    }
    const answer = (result.messages || [])
      .filter(
        (message) =>
          message.role === RoleType.Assistant && message.type === 'answer',
      )
      .map((message) => message.content)
      .join('\n')
      .trim();
    if (!answer) throw new Error('Coze 未返回可用回复');
    return completionStream(answer);
  }
}

export default CozeAI;
