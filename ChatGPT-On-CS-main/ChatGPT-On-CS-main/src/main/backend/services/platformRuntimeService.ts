import { execFile } from 'child_process';
import { promisify } from 'util';
import { Op } from 'sequelize';
import { Platform } from '../types';
import { Config } from '../entities/config';

const execFileAsync = promisify(execFile);

const PLATFORMS: Array<Platform & { processes: string[] }> = [
  {
    id: 'win_qianniu',
    name: '千牛',
    type: 'E_COMMERCE',
    env: 'desktop',
    processes: ['aliworkbench.exe', 'qianniu.exe'],
  },
  {
    id: 'win_jinmai',
    name: '京麦',
    type: 'E_COMMERCE',
    env: 'desktop',
    processes: ['jingmai.exe', 'jingmaiworkbench.exe', 'jdworkstation.exe'],
  },
  {
    id: 'win_wechat',
    name: '微信',
    type: 'HOT',
    env: 'desktop',
    processes: ['wechat.exe', 'weixin.exe'],
  },
  {
    id: 'win_wecom',
    name: '企微',
    type: 'HOT',
    env: 'desktop',
    processes: ['wxwork.exe', 'wecom.exe'],
  },
];

async function getProcessNames(): Promise<Set<string>> {
  if (process.platform !== 'win32') return new Set();
  try {
    const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
    });
    return new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.match(/^"([^"]+)"/)?.[1]?.toLowerCase())
        .filter((name): name is string => Boolean(name)),
    );
  } catch {
    return new Set();
  }
}

export async function getActivePlatforms(): Promise<Platform[]> {
  const statuses = await getPlatformStatuses();
  return statuses.filter((platform) => platform.running);
}

export async function getPlatformStatuses(): Promise<
  Array<Platform & { running: boolean }>
> {
  const names = await getProcessNames();
  return PLATFORMS.map(({ processes, ...platform }) => ({
    ...platform,
    running: processes.some((name) => names.has(name)),
  }));
}

export async function isPlatformRunning(platformId: string): Promise<boolean> {
  const platforms = await getActivePlatforms();
  return platforms.some((platform) => platform.id === platformId);
}

/**
 * 检查指定平台是否已在配置中激活。
 * 优先读取平台级配置（instance_id 为空），若不存在再回退到全局配置。
 */
export async function isPlatformActive(platformId: string): Promise<boolean> {
  try {
    const platformConfig = await Config.findOne({
      where: {
        platform_id: platformId,
        instance_id: {
          [Op.or]: ['', null],
        },
      },
    });
    if (platformConfig) {
      return Boolean(platformConfig.active);
    }
    const globalConfig = await Config.findOne({ where: { global: true } });
    return Boolean(globalConfig?.active);
  } catch {
    return false;
  }
}
