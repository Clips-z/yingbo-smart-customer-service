import { LoggerService } from './loggerService';

/**
 * 情绪标签
 */
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'urgent' | 'angry';

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: number; // 0-1
  summary: string; // 情绪摘要
  suggestedAction?: string; // 建议行动
}

/**
 * 情绪分析服务
 * 基于 LLM prompt 工程的轻量级情绪分析，无需额外模型部署。
 * 检测客户情绪：愤怒/焦虑/满意/紧急，自动调整回复策略。
 */
export class SentimentService {
  private cache: Map<string, SentimentResult> = new Map();
  private static readonly MAX_CACHE_SIZE = 200;

  constructor(private log: LoggerService) {}

  /**
   * 分析消息情绪
   * @param messages 最近的对话消息列表
   * @param llmConfig LLM 配置
   */
  async analyze(
    messages: Array<{ role: string; content: string }>,
    llmConfig: { baseUrl: string; key: string; model: string },
  ): Promise<SentimentResult> {
    // 简单关键词预检测（快速路径，减少 LLM 调用）
    const lastMsg = messages[messages.length - 1]?.content || '';
    const quickResult = this.quickDetect(lastMsg);
    if (quickResult && quickResult.confidence > 0.9) {
      return quickResult;
    }

    // 缓存查找
    const cacheKey = messages.map((m) => m.content.slice(0, 50)).join('|');
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // LLM 分析
    const prompt = `分析以下客服对话中客户的最新情绪。返回 JSON 格式（不要其他内容）：
{
  "sentiment": "positive|neutral|negative|urgent|angry",
  "confidence": 0.0-1.0,
  "summary": "一句话情绪摘要",
  "suggestedAction": "建议的客服应对策略"
}

对话：
${messages.map((m) => `${m.role === 'user' ? '客户' : '客服'}: ${m.content}`).join('\n')}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const baseUrl = llmConfig.baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.key}`,
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return this.getDefaultResult(lastMsg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      // 解析 JSON（处理 markdown 代码块包裹的情况）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.getDefaultResult(lastMsg);

      const result: SentimentResult = JSON.parse(jsonMatch[0]);
      result.confidence = Math.min(1, Math.max(0, result.confidence || 0.5));

      // 缓存
      if (this.cache.size >= SentimentService.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, result);

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn(`情绪分析失败: ${msg}`);
      return this.getDefaultResult(lastMsg);
    }
  }

  /**
   * 快速关键词检测（不需要 LLM 调用）
   */
  private quickDetect(text: string): SentimentResult | null {
    const lower = text.toLowerCase();

    // 愤怒关键词
    const angryKeywords = [
      '投诉', '举报', '差评', '退款', '退货', '骗子', '垃圾', '坑',
      '气死', '太过分', '无良', '曝光', '12315', '消费者协会',
      '你他妈', '卧槽', '滚', '傻逼', '妈的', '操',
    ];
    const angryMatch = angryKeywords.filter((kw) => lower.includes(kw));
    if (angryMatch.length >= 2) {
      return {
        sentiment: 'angry',
        confidence: 0.95,
        summary: `客户使用了多个愤怒关键词: ${angryMatch.join(', ')}`,
        suggestedAction: '立即转人工处理，安抚客户情绪，优先解决投诉问题',
      };
    }

    // 紧急关键词
    const urgentKeywords = [
      '急', '快回复', '在吗', '有人吗', '什么时候', '多久',
      '今天能', '马上', '赶紧', '着急',
    ];
    const urgentMatch = urgentKeywords.filter((kw) => lower.includes(kw));
    if (urgentMatch.length >= 2) {
      return {
        sentiment: 'urgent',
        confidence: 0.85,
        summary: `客户表达了紧迫感: ${urgentMatch.join(', ')}`,
        suggestedAction: '优先处理，快速响应，告知处理时间',
      };
    }

    // 负面关键词
    const negativeKeywords = [
      '不行', '不对', '不好', '差', '慢', '不满意', '失望',
      '没收到', '怎么还没', '太慢', '不发货',
    ];
    const negMatch = negativeKeywords.filter((kw) => lower.includes(kw));
    if (negMatch.length >= 2) {
      return {
        sentiment: 'negative',
        confidence: 0.8,
        summary: `客户表达了不满: ${negMatch.join(', ')}`,
        suggestedAction: '道歉并主动提供解决方案，跟踪处理进度',
      };
    }

    // 满意关键词
    const positiveKeywords = [
      '谢谢', '好的', '不错', '满意', '好评', '赞', '很棒',
      '可以', 'OK', 'ok', '好的呢', '太好了',
    ];
    const posMatch = positiveKeywords.filter((kw) => lower.includes(kw));
    if (posMatch.length >= 1 && !negMatch.length && !angryMatch.length) {
      return {
        sentiment: 'positive',
        confidence: 0.75,
        summary: `客户表达了正面反馈: ${posMatch.join(', ')}`,
        suggestedAction: '保持友好态度，适当引导好评',
      };
    }

    return null; // 无法快速判断，需要 LLM 分析
  }

  /**
   * 默认情绪结果
   */
  private getDefaultResult(text: string): SentimentResult {
    const quick = this.quickDetect(text);
    return quick || {
      sentiment: 'neutral',
      confidence: 0.5,
      summary: '未检测到明显情绪倾向',
      suggestedAction: '正常回复即可',
    };
  }
}
