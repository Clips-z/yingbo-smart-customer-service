import { spawn } from 'child_process';
import { createServer } from 'net';
import fs from 'fs';
import path from 'path';
import { getTempPath } from '../utils';

class BackendServiceManager {
  private executablePath: string;

  private process: ReturnType<typeof spawn> | null;

  private logStream!: fs.WriteStream;

  private logFilePath!: string;

  private port: number;

  private autoRestart: boolean; // 新增自动重启标志

  private MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

  private MAX_LOG_FILES = 10;

  constructor(executablePath: string, autoRestart: boolean = true) {
    this.executablePath = executablePath;
    this.process = null;
    this.port = 0;
    this.autoRestart = autoRestart; // 是否自动重启
  }

  async start() {
    if (process.env.NODE_ENV === 'development') {
      this.port = 9999;
      return;
    }

    // 避免重复启动时端口冲突
    if (!this.port) {
      const port = await this.getAvailablePort();
      this.port = port;
    }

    // 检查可执行文件是否存在，不存在则跳过后端启动（不阻止 UI 加载）
    if (!fs.existsSync(this.executablePath)) {
      console.warn(
        `Backend executable not found at ${this.executablePath}, skipping backend startup. UI will still load.`,
      );
      this.autoRestart = false;
      return;
    }

    this.launchProcess(this.port);

    // 监听退出事件并可能重启
    this.process?.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      if (this.autoRestart && this.process) {
        console.log('Attempting to restart...');
        this.process = null;
        setTimeout(() => {
          this.start().catch((err) => console.error('Failed to restart:', err));
        }, 3000); // 延迟 3 秒避免快速循环
      }
    });
  }

  private rotateLogs() {
    if (this.logStream) {
      this.logStream.close();
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newLogFilePath = this.logFilePath.replace(
      'process.log',
      `process-${timestamp}.log`,
    );
    fs.renameSync(this.logFilePath, newLogFilePath);

    // 只列出日志文件，按修改时间排序（最旧的在前面）
    const logDir = path.dirname(this.logFilePath);
    const logFiles = fs.readdirSync(logDir)
      .filter((f) => f.startsWith('process-') && f.endsWith('.log'))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(logDir, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime)
      .map((f) => f.name);

    while (logFiles.length > this.MAX_LOG_FILES) {
      const oldestLogFile = logFiles.shift();
      if (!oldestLogFile) {
        break;
      }
      fs.unlinkSync(path.join(logDir, oldestLogFile));
    }

    this.logFilePath = path.join(path.dirname(this.logFilePath), 'process.log');
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  private checkLogSizeAndRotate() {
    const logSize = fs.existsSync(this.logFilePath)
      ? fs.statSync(this.logFilePath).size
      : 0;
    if (logSize > this.MAX_LOG_SIZE) {
      this.rotateLogs();
    }
  }

  private launchProcess(port: number) {
    const logDir = getTempPath();
    this.logFilePath = path.join(logDir, 'process.log');
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

    this.process = spawn(this.executablePath, ['--port', port.toString()]);
    console.log(
      `Starting backend process: ${this.executablePath} --port ${port}`,
    );

    this.process.stdout?.on('data', (data: Buffer | string) => {
      const text = Buffer.isBuffer(data) ? data.toString() : data;
      this.logStream.write(`stdout: ${text}`);
      this.checkLogSizeAndRotate();
    });

    this.process.stderr?.on('data', (data: Buffer | string) => {
      const text = Buffer.isBuffer(data) ? data.toString() : data;
      this.logStream.write(`stderr: ${text}`);
      this.checkLogSizeAndRotate();
    });

    this.process.on('close', () => {
      this.logStream.close();
    });

    this.process.on('error', (err) => {
      console.error('Failed to start subprocess.', err.message);
      // spawn 失败时 pid 为 undefined，清理 process 引用避免后续 kill 报错
      if (!this.process?.pid) {
        this.process = null;
        this.autoRestart = false;
      }
    });

    console.log(`Backend process started with PID: ${this.process.pid}`);
  }

  async getAvailablePort(): Promise<number> {
    const configured = Number(process.env.YINGBO_BACKEND_PORT || 9999);
    if (Number.isInteger(configured) && configured > 0 && configured < 65536) {
      const preferredAvailable = await this.isPortAvailable(configured);
      if (preferredAvailable) return configured;
      console.warn(
        `Preferred backend port ${configured} is occupied; using an ephemeral port. The QianNiu official bridge will remain disconnected until the configured port is available.`,
      );
    }
    return this.reserveEphemeralPort();
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
  }

  private async reserveEphemeralPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number };
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  stop() {
    // 修改停止方法以标记不自动重启
    return new Promise((resolve) => {
      this.autoRestart = false; // 停止时禁用自动重启
      if (this.process && this.process.pid) {
        console.log('Stopping process...');
        try {
          this.process.kill();
        } catch (e) {
          // kill 失败说明进程已经不在了，忽略错误
          console.warn('Process already exited or kill failed:', e);
          this.process = null;
          resolve({});
          return;
        }
        // 强制退出超时保护
        const timer = setTimeout(() => {
          if (this.process && this.process.pid) {
            try {
              this.process.kill('SIGKILL');
            } catch {
              // 忽略
            }
          }
        }, 5000);
        this.process.on('close', () => {
          clearTimeout(timer);
          this.process = null;
          resolve({});
        });
        this.process.on('error', (err) => {
          clearTimeout(timer);
          console.warn('Error during stop:', err.message);
          this.process = null;
          resolve({}); // 用 resolve 而非 reject，避免 quit 时 unhandled rejection
        });
      } else {
        this.process = null;
        resolve({});
      }
    });
  }

  getPort() {
    return this.port;
  }
}

export default BackendServiceManager;
