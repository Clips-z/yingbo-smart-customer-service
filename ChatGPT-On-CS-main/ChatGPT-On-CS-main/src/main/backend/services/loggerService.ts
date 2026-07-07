import { BrowserWindow } from 'electron';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'success';

export class LoggerService {
  constructor(private mainWindow: BrowserWindow) {}

  /**
   * 向渲染进程发送日志，如果窗口已被销毁则跳过
   */
  private send(level: LogLevel, content: string): void {
    if (this.mainWindow.isDestroyed()) return;

    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        level,
        time: new Date().toLocaleTimeString(),
        content,
      },
    });
  }

  public log(msg: string): void {
    console.log(msg);
    this.send('log', msg);
  }

  public error(msg: string): void {
    console.error('[ERROR]', msg);
    this.send('error', `[ERROR] ${msg}`);
  }

  public info(msg: string): void {
    console.info('[INFO]', msg);
    this.send('info', `[INFO] ${msg}`);
  }

  public warn(msg: string): void {
    console.warn('[WARN]', msg);
    this.send('warn', `[WARN] ${msg}`);
  }

  public success(msg: string): void {
    console.log('[SUCCESS]', msg);
    this.send('success', `[SUCCESS] ${msg}`);
  }
}
