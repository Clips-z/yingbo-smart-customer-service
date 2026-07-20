import { LoggerService } from './loggerService';

/**
 * TTS（文本转语音）服务
 * 将生成的回复文本转换为语音，用于语音消息场景。
 * 使用 Edge TTS（免费，无需 API Key）或硅基流动 TTS API。
 */
export class TtsService {
  private cache: Map<string, Buffer> = new Map();
  private static readonly MAX_CACHE_SIZE = 50;

  constructor(private log: LoggerService) {}

  /**
   * 将文本转为语音
   * @param text 要转换的文本
   * @param config TTS 配置
   * @returns 语音数据 Buffer（MP3 格式）
   */
  async synthesize(
    text: string,
    config?: {
      provider?: 'edge' | 'siliconflow';
      voice?: string;
      apiKey?: string;
      baseUrl?: string;
    },
  ): Promise<Buffer | null> {
    const provider = config?.provider || 'edge';
    const cacheKey = `${provider}:${config?.voice || 'default'}:${text}`;

    // 缓存检查
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      let audioBuffer: Buffer | null = null;

      if (provider === 'siliconflow' && config?.apiKey) {
        audioBuffer = await this.synthesizeSiliconflow(text, {
          ...config,
          apiKey: config.apiKey,
        });
      } else {
        audioBuffer = await this.synthesizeEdge(text, config?.voice);
      }

      if (audioBuffer) {
        if (this.cache.size >= TtsService.MAX_CACHE_SIZE) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, audioBuffer);
      }

      return audioBuffer;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn(`TTS 合成失败: ${msg}`);
      return null;
    }
  }

  /**
   * Edge TTS（免费，基于 Microsoft Edge 浏览器引擎）
   * 通过 SSML 控制语音参数
   */
  private async synthesizeEdge(
    text: string,
    voice?: string,
  ): Promise<Buffer | null> {
    const selectedVoice = voice || 'zh-CN-XiaoxiaoNeural';

    // Edge TTS 使用 WebSocket 协议，这里使用简化版 HTTP 代理
    // 注意：完整的 Edge TTS 需要 WebSocket 连接，这里提供一个基于 HTTP 的简化实现
    const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="${selectedVoice}">
    <prosody rate="1.0" pitch="+0Hz">
      ${this.escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

    try {
      // 使用 Microsoft Edge TTS HTTP API
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: ssml,
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        this.log.warn(`Edge TTS 请求失败: ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn(`Edge TTS 调用异常: ${msg}`);
      return null;
    }
  }

  /**
   * 硅基流动 TTS API
   */
  private async synthesizeSiliconflow(
    text: string,
    config: { apiKey: string; voice?: string; baseUrl?: string },
  ): Promise<Buffer | null> {
    const baseUrl = (config.baseUrl || 'https://api.siliconflow.cn').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: 'fishaudio/fish-speech-1.4',
          input: text,
          voice: config.voice || 'fishaudio/fish-speech-1.4:alex',
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.log.warn(`硅基流动 TTS 请求失败: ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn(`硅基流动 TTS 调用异常: ${msg}`);
      return null;
    }
  }

  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
