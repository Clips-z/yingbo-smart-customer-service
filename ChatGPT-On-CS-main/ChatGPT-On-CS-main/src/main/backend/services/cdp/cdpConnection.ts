import { CdpMessage, CdpSocket } from './cdpTypes';
import { CdpWebSocket } from './cdpWebSocket';

export type CdpSocketFactory = (url: URL) => CdpSocket;

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CdpConnection {
  private socket?: CdpSocket;

  private nextId = 0;

  private readonly pending = new Map<number, PendingCommand>();

  private readonly eventListeners = new Map<
    string,
    Set<(params: Record<string, unknown>) => void>
  >();

  private readonly socketFactory: CdpSocketFactory;

  constructor(
    private readonly websocketUrl: string,
    socketFactory: CdpSocketFactory = (url) => new CdpWebSocket(url),
    private readonly commandTimeoutMs = 10_000,
  ) {
    this.socketFactory = socketFactory;
  }

  public async connect(): Promise<void> {
    if (this.socket) return;
    const socket = this.socketFactory(new URL(this.websocketUrl));
    this.socket = socket;
    socket.onMessage((payload) => this.handleMessage(payload));
    socket.onClose(() => this.rejectPending(new Error('CDP connection closed')));
    socket.onError((error) => this.rejectPending(error));
    try {
      await socket.open();
    } catch (error) {
      this.socket = undefined;
      throw error;
    }
  }

  public async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.socket) throw new Error('CDP connection is not open');
    const id = ++this.nextId;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  public on(
    method: string,
    listener: (params: Record<string, unknown>) => void,
  ): () => void {
    const listeners = this.eventListeners.get(method) || new Set();
    listeners.add(listener);
    this.eventListeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  public close(): void {
    this.socket?.close();
    this.socket = undefined;
    this.rejectPending(new Error('CDP connection closed'));
  }

  private handleMessage(payload: string): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(payload) as CdpMessage;
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (!message.method) return;
    this.eventListeners.get(message.method)?.forEach((listener) => {
      listener(message.params || {});
    });
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
