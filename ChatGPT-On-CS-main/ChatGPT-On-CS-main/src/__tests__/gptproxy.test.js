import 'openai/shims/node';
import { ReadableStream } from 'stream/web';
import { TextEncoder } from 'util';

// eslint-disable-next-line import/first
import { APIError } from '@coze/api';
import { DifyAI } from '../main/gptproxy';
import { formatCozeError, limitCozeConversation } from '../main/gptproxy/coze';

describe('DifyAI', () => {
  it('converts Dify streaming chat events to OpenAI chat chunks', async () => {
    const fetch = jest.fn(async () => {
      const body = [
        'data: {"event":"message","conversation_id":"conversation-id","message_id":"message-id","created_at":1718175273,"task_id":"task-id","id":"message-id","answer":"Hello"}',
        'data: {"event":"message_end","conversation_id":"conversation-id","message_id":"message-id","created_at":1718175274,"task_id":"task-id","id":"message-id","answer":""}',
        '',
      ].join('\n\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      });

      return {
        ok: true,
        status: 200,
        url: 'https://example.test/v1/chat-messages',
        headers: {
          get: (name) =>
            name.toLowerCase() === 'content-type' ? 'text/event-stream' : null,
          entries: () =>
            [['content-type', 'text/event-stream']][Symbol.iterator](),
        },
        body: stream,
      };
    });

    const dify = new DifyAI({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch,
    });

    const response = await dify.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const chunks = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const chunk of response) {
      chunks.push(chunk);
    }

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chunks[0].choices[0].delta.content).toBe('Hello');
    expect(chunks[1].choices[0].finish_reason).toBe('stop');
  });
});

describe('CozeAI helpers', () => {
  it('keeps only recent complete conversation messages within limits', () => {
    const messages = [
      { role: 'system', content: 'local prompt must not be sent' },
      { role: 'assistant', content: 'orphan answer' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'latest question' },
    ];

    expect(limitCozeConversation(messages, 3, 100)).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'latest question' },
    ]);
  });

  it('turns Coze authentication errors into actionable messages', () => {
    const error = APIError.generate(
      401,
      { code: 401, msg: 'unauthorized', detail: { logid: 'log-123' } },
      'unauthorized',
      undefined,
    );

    expect(formatCozeError(error)).toContain('Token 无效或已过期');
    expect(formatCozeError(error)).toContain('log-123');
  });
});
