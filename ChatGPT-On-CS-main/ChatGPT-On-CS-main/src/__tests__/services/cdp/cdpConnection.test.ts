import { CdpConnection } from '../../../main/backend/services/cdp/cdpConnection';
import { CdpSocket } from '../../../main/backend/services/cdp/cdpTypes';

class FakeSocket implements CdpSocket {
  private readonly messageListeners = new Set<(payload: string) => void>();

  private readonly closeListeners = new Set<() => void>();

  public sent: string[] = [];

  public async open(): Promise<void> {}

  public send(payload: string): void {
    this.sent.push(payload);
  }

  public close(): void {
    this.closeListeners.forEach((listener) => listener());
  }

  public onMessage(listener: (payload: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onError(): () => void {
    return () => undefined;
  }

  public onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  public receive(payload: unknown): void {
    this.messageListeners.forEach((listener) => listener(JSON.stringify(payload)));
  }
}

describe('CdpConnection', () => {
  test('correlates command responses and delivers events', async () => {
    const socket = new FakeSocket();
    const connection = new CdpConnection('ws://127.0.0.1/devtools/page/test', () => socket);
    const event = jest.fn();
    connection.on('Runtime.consoleAPICalled', event);

    await connection.connect();
    const resultPromise = connection.send('Runtime.enable');
    expect(socket.sent).toHaveLength(1);
    const command = JSON.parse(socket.sent[0]) as { id: number; method: string };
    expect(command.method).toBe('Runtime.enable');

    socket.receive({ id: command.id, result: { ok: true } });
    socket.receive({ method: 'Runtime.consoleAPICalled', params: { type: 'log' } });

    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(event).toHaveBeenCalledWith({ type: 'log' });
  });

  test('rejects a command error', async () => {
    const socket = new FakeSocket();
    const connection = new CdpConnection('ws://127.0.0.1/devtools/page/test', () => socket);
    await connection.connect();
    const resultPromise = connection.send('DOM.getDocument');
    const command = JSON.parse(socket.sent[0]) as { id: number };
    socket.receive({ id: command.id, error: { code: -32000, message: 'not found' } });
    await expect(resultPromise).rejects.toThrow('-32000: not found');
  });
});
