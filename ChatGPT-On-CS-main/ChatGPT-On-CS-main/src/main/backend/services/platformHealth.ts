export type PlatformHealthReason =
  | 'client_not_running'
  | 'not_logged_in'
  | 'window_not_found'
  | 'ocr_unavailable'
  | 'ocr_low_confidence'
  | 'send_timeout'
  | 'send_failed'
  | 'collector_unhealthy';

const RECOVERY_ACTIONS: Record<PlatformHealthReason, string> = {
  client_not_running: '请启动并登录客服客户端',
  not_logged_in: '请先在客户端完成登录',
  window_not_found: '请打开客服会话窗口后重试',
  ocr_unavailable: '请检查 OCR 运行环境后重试',
  ocr_low_confidence: '请人工核对识别内容，本次不会自动发送',
  send_timeout: '请确认客户端可操作后手动重试',
  send_failed: '请检查客户端状态并手动重试',
  collector_unhealthy: '请等待采集器自动恢复或重启客户端',
};

export function normalizePlatformHealthError(error?: string): {
  reasonCode?: PlatformHealthReason;
  recoveryAction?: string;
} {
  if (!error) return {};
  const value = error.toLowerCase();
  let reasonCode: PlatformHealthReason = 'collector_unhealthy';
  if (/未启动|已关闭|not running/.test(value)) reasonCode = 'client_not_running';
  else if (/未登录|not logged/.test(value)) reasonCode = 'not_logged_in';
  else if (/窗口.*(?:未找到|不存在)|window.*not found/.test(value)) reasonCode = 'window_not_found';
  else if (/ocr.*(?:不可用|未安装|unavailable)/.test(value)) reasonCode = 'ocr_unavailable';
  else if (/置信度|low confidence/.test(value)) reasonCode = 'ocr_low_confidence';
  else if (/超时|timeout/.test(value)) reasonCode = 'send_timeout';
  else if (/发送.*失败|send failed/.test(value)) reasonCode = 'send_failed';
  return { reasonCode, recoveryAction: RECOVERY_ACTIONS[reasonCode] };
}
