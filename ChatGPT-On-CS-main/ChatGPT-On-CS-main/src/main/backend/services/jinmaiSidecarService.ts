import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { BaseSidecarService, SidecarConfig } from './baseSidecarService';

const jinmaiConfig: SidecarConfig = {
  platformId: 'win_jinmai',
  platformName: '京麦',
  platformKey: 'jinmai',
  scriptName: 'jinmai-sidecar.py',
  backendArg: 'jinmai',
  heartbeatTimeoutMs: 15_000,
  healthEventName: 'jinmai_collector_health_changed',
  modeEventName: 'jinmai_reply_mode_changed',
  configModeKey: 'jinmai_reply_mode',
};

export class JinmaiSidecarService extends BaseSidecarService {
  constructor(
    port: number,
    log: LoggerService,
    dispatchService: DispatchService,
  ) {
    super(port, log, dispatchService, jinmaiConfig);
  }
}

// 向后兼容的类型导出
export type JinmaiReplyMode = 'hint' | 'assist' | 'unattended';
export type JinmaiCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';
export type { CollectorHealth as JinmaiCollectorHealth } from './baseSidecarService';
