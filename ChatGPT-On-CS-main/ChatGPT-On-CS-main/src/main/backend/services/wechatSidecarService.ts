import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { BaseSidecarService, SidecarConfig } from './baseSidecarService';

const wechatConfig: SidecarConfig = {
  platformId: 'win_wechat',
  platformName: '微信',
  platformKey: 'wechat',
  scriptName: 'wechat-sidecar.py',
  backendArg: 'auto',
  heartbeatTimeoutMs: 15_000,
  healthEventName: 'wechat_collector_health_changed',
  modeEventName: 'wechat_reply_mode_changed',
  configModeKey: 'wechat_reply_mode',
};

export class WechatSidecarService extends BaseSidecarService {
  constructor(
    port: number,
    log: LoggerService,
    dispatchService: DispatchService,
  ) {
    super(port, log, dispatchService, wechatConfig);
  }

  // 微信 sidecar 使用默认基类实现，无需额外定制
  // 如果未来需要微信特有的逻辑，可以在这里覆盖方法
}

// 向后兼容的类型导出
export type WechatReplyMode = 'hint' | 'assist' | 'unattended';
export type WechatCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';
export type { CollectorHealth as WechatCollectorHealth } from './baseSidecarService';
