import { LoggerService } from './loggerService';

/**
 * 多模态视觉服务
 * 处理客服场景中的图片消息，通过 LLM Vision API 理解图片内容。
 */
export class VisionService {
  constructor(private log: LoggerService) {}

  /**
   * 分析图片内容，返回文字描述
   * @param imageBase64 图片的 Base64 编码数据
   * @param llmConfig LLM 配置（baseUrl, key, model）
   * @param context 可选的上下文提示（如"这是一张物流截图"）
   */
  async analyzeImage(
    imageBase64: string,
    llmConfig: { baseUrl: string; key: string; model: string },
    context?: string,
  ): Promise<{ description: string; rawResponse: string }> {
    const prompt = context
      ? `请描述这张图片的内容。上下文：${context}。请用中文简洁描述。`
      : '请描述这张图片的内容。请用中文简洁描述，提取关键信息（如订单号、物流状态、金额、商品名称等）。';

    const body = {
      model: llmConfig.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const baseUrl = llmConfig.baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        this.log.warn(`Vision API 请求失败: ${response.status} ${errorText}`);
        return {
          description: `[图片无法识别: HTTP ${response.status}]`,
          rawResponse: errorText,
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '[未识别到内容]';
      return { description: content, rawResponse: JSON.stringify(data) };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn(`Vision API 调用异常: ${msg}`);
      return { description: `[图片识别失败: ${msg}]`, rawResponse: msg };
    }
  }

  /**
   * 判断消息中是否包含图片（通过检测 base64 或图片标记）
   */
  static hasImage(content: string): boolean {
    return (
      content.startsWith('data:image/') ||
      content.startsWith('[') && content.includes('image') ||
      /!\[.*\]\(.*\.(png|jpg|jpeg|gif|webp)\)/i.test(content)
    );
  }
}
