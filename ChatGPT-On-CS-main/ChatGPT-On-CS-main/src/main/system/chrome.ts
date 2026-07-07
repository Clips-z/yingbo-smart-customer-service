import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Chrome 可能存在的路径列表
 * 覆盖 Windows 下所有常见的 Chrome 安装位置
 */
function getChromeCandidatePaths(): string[] {
  const paths: string[] = [];

  // Program Files (64位)
  paths.push(
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  );
  // Program Files (x86) (32位)
  paths.push(
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  );
  // LocalAppData (用户级安装)
  paths.push(
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  );

  // 也检查 Chromium / Edge（作为后备方案）
  const localAppData = process.env.LOCALAPPDATA || '';
  paths.push(path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  paths.push(path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'));

  return paths;
}

/**
 * 通过文件系统直接检测 Chrome 是否安装（不依赖 PowerShell）
 */
async function findChromePath(): Promise<string | null> {
  const candidates = getChromeCandidatePaths();
  const fs = await import('fs');

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // 忽略权限等错误
    }
  }

  // 最后尝试通过 where 命令查找
  try {
    const { stdout } = await execFileAsync('where.exe', ['chrome'], {
      timeout: 3000,
      shell: true,
    });
    const firstLine = stdout.split('\n')[0]?.trim();
    if (firstLine && firstLine.endsWith('.exe')) {
      return firstLine;
    }
  } catch {
    // where 命令失败也忽略
  }

  return null;
}

/**
 * 从 exe 文件读取文件版本信息（Windows 专用）
 */
async function readFileVersion(exePath: string): Promise<string | null> {
  try {
    // 使用 PowerShell 单条命令获取版本（比原来简单得多）
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      `-Command`,
      `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.FileVersion`,
    ], {
      timeout: 10000,
      env: { ...process.env },
    });

    const match = stdout.trim().match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch (error) {
    console.error('[chrome-detect] Failed to read file version:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getBrowserVersionFromOS(): Promise<string | null> {
  try {
    const chromePath = await findChromePath();

    if (!chromePath) {
      console.log('[chrome-detect] No Chrome/Chromium installation found in any known path');
      return null;
    }

    console.log(`[chrome-detect] Found browser at: ${chromePath}`);

    // 尝试获取版本号
    const version = await readFileVersion(chromePath);
    if (version) {
      console.log(`[chrome-detect] Browser version: ${version}`);
      return version;
    }

    // 文件存在但无法获取版本号——仍然认为浏览器已安装
    // 返回一个默认版本号避免前端误报"未安装"
    console.log('[chrome-detect] Found browser but could not determine version, returning default');
    return 'installed';
  } catch (error) {
    console.error('[chrome-detect] Unexpected error:', error);
    return null;
  }
}
