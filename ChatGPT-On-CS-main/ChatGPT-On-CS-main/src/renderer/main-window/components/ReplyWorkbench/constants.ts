import { QianniuReplyMode, ReplySuggestion } from '../../../common/services/platform/platform';

export const modeLabels: Record<QianniuReplyMode, string> = {
  hint: '仅提示',
  assist: '辅助回复',
  unattended: '无人值守',
};

export const statusLabels: Record<ReplySuggestion['status'], string> = {
  pending: '待回复',
  prepared: '已填入',
  sent: '已发送',
  failed: '发送失败',
  dismissed: '已处理',
};

export const platformLabels: Record<string, string> = {
  win_qianniu: '千牛',
  win_wechat: '微信',
  win_jinmai: '京麦',
  win_wecom: '企微',
  win_pdd: '拼多多',
  win_douyin: '抖音电商',
};

export const healthLabels = {
  stopped: '采集已停止',
  starting: '采集启动中',
  running: '采集正常',
  degraded: '采集异常',
} as const;

export const statusColorMap: Record<ReplySuggestion['status'], string> = {
  pending: 'orange',
  prepared: 'blue',
  sent: 'green',
  failed: 'red',
  dismissed: 'gray',
};

export const borderColorMap: Record<ReplySuggestion['status'], string> = {
  pending: 'orange.200',
  prepared: 'gray.200',
  sent: 'gray.200',
  failed: 'red.300',
  dismissed: 'gray.200',
};

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getHealthColorScheme(state: string): string {
  switch (state) {
    case 'running':
      return 'green';
    case 'starting':
      return 'blue';
    case 'degraded':
      return 'red';
    default:
      return 'gray';
  }
}
