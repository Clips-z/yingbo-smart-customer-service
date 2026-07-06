import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { BaseSidecarService, SidecarConfig } from './baseSidecarService';

const pddConfig: SidecarConfig = {
  platformId: 'win_pdd',
  platformName: '拼多多',
  platformKey: 'pdd',
  scriptName: 'pdd-sidecar.py',
  backendArg: 'pdd',
  heartbeatTimeoutMs: 30_000, // OCR 采集较慢
  healthEventName: 'pdd_collector_health_changed',
  modeEventName: 'pdd_reply_mode_changed',
  configModeKey: 'pdd_reply_mode',
};

export class PddSidecarService extends BaseSidecarService {
  constructor(
    port: number,
    log: LoggerService,
    dispatchService: DispatchService,
  ) {
    super(port, log, dispatchService, pddConfig);
  }
}

// 向后兼容的类型导出
export type PddReplyMode = 'hint' | 'assist' | 'unattended';
export type PddCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';
export type { CollectorHealth as PddCollectorHealth } from './baseSidecarService';
