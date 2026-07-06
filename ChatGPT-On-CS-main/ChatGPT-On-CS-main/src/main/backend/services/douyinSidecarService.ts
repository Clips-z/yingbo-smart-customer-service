import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { BaseSidecarService, SidecarConfig } from './baseSidecarService';

const douyinConfig: SidecarConfig = {
  platformId: 'win_douyin',
  platformName: '抖音电商',
  platformKey: 'douyin',
  scriptName: 'douyin-sidecar.py',
  backendArg: 'douyin',
  heartbeatTimeoutMs: 30_000, // OCR 采集较慢
  healthEventName: 'douyin_collector_health_changed',
  modeEventName: 'douyin_reply_mode_changed',
  configModeKey: 'douyin_reply_mode',
};

export class DouyinSidecarService extends BaseSidecarService {
  constructor(
    port: number,
    log: LoggerService,
    dispatchService: DispatchService,
  ) {
    super(port, log, dispatchService, douyinConfig);
  }
}

// 向后兼容的类型导出
export type DouyinReplyMode = 'hint' | 'assist' | 'unattended';
export type DouyinCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';
export type { CollectorHealth as DouyinCollectorHealth } from './baseSidecarService';
