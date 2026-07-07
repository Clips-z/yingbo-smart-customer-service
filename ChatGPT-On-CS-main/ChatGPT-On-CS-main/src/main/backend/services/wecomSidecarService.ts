import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { BaseSidecarService, SidecarConfig } from './baseSidecarService';

const wecomConfig: SidecarConfig = {
  platformId: 'win_wecom',
  platformName: '企业微信',
  platformKey: 'wecom',
  scriptName: 'wecom-sidecar.py',
  backendArg: 'wecom',
  heartbeatTimeoutMs: 30_000, // 企微 OCR 采集较慢，心跳超时设长一点
  healthEventName: 'wecom_collector_health_changed',
  modeEventName: 'wecom_reply_mode_changed',
  configModeKey: 'wecom_reply_mode',
};

export class WecomSidecarService extends BaseSidecarService {
  constructor(
    port: number,
    log: LoggerService,
    dispatchService: DispatchService,
  ) {
    super(port, log, dispatchService, wecomConfig);
  }
}

// 向后兼容的类型导出
export type WecomReplyMode = 'hint' | 'assist' | 'unattended';
export type WecomCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';
export type { CollectorHealth as WecomCollectorHealth } from './baseSidecarService';
