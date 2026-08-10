import crypto from 'crypto';
import net from 'net';
import tls from 'tls';
import { CdpSocket } from './cdpTypes';

type Listener<T> = (value: T) => void;

/**
 * Small dependency-free WebSocket client for localhost CDP endpoints.
 * CDP speaks ordinary RFC6455 text frames; keeping this local avoids adding
 * another native/runtime dependency to the packaged Electron application.
 */
export class CdpWebSocket implements CdpSocket {
  private socket?: net.Socket;

  private readonly messages = new Set<Listener<string>>();

  private readonly errors = new Set<Listener<Error>>();

  private readonly closes = new Set<Listener<void>>();

  private buffer = Buffer.alloc(0);

  private handshakeBuffer = Buffer.alloc(0);

  private handshaken = false;

  private closed = false;

  private resolveOpen?: () => void;

  private rejectOpen?: (error: Error) => void;

  constructor(private readonly endpoint: URL) {}

  public open(): Promise<void> {
    if (this.socket) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.resolveOpen = resolve;
      this.rejectOpen = reject;
      const isTls = this.endpoint.protocol === 'wss:';
      const port = Number(this.endpoint.port || (isTls ? 443 : 80));
      const connectOptions = {
        host: this.endpoint.hostname,
        port,
        ...(isTls ? { servername: this.endpoint.hostname } : {}),
      };
      const socket = isTls
        ? tls.connect(connectOptions)
        : net.connect(connectOptions);
      this.socket = socket;
      socket.setTimeout(10_000);
      socket.on('connect', () => this.writeHandshake());
      socket.on('data', (data) => this.handleData(Buffer.from(data)));
      socket.on('timeout', () => this.fail(new Error('CDP WebSocket timeout')));
      socket.on('error', (error) => this.fail(error));
      socket.on('close', () => this.handleClose());
    });
  }

  public send(payload: string): void {
    if (!this.socket || !this.handshaken || this.closed) {
      throw new Error('CDP WebSocket is not open');
    }
    const body = Buffer.from(payload, 'utf8');
    const mask = crypto.randomBytes(4);
    let header: Buffer;
    if (body.length < 126) {
      header = Buffer.from([0x81, 0x80 | body.length]);
    } else if (body.length < 65_536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    const masked = Buffer.alloc(body.length);
    for (let index = 0; index < body.length; index += 1) {
      masked[index] = body[index] ^ mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, masked] as any) as any);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket?.end();
    this.handleClose();
  }

  public onMessage(listener: Listener<string>): () => void {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  public onError(listener: Listener<Error>): () => void {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }

  public onClose(listener: Listener<void>): () => void {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }

  private writeHandshake(): void {
    const key = crypto.randomBytes(16).toString('base64');
    const path = `${this.endpoint.pathname || '/'}${this.endpoint.search || ''}`;
    const request = [
      `GET ${path} HTTP/1.1`,
      `Host: ${this.endpoint.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '\r\n',
    ].join('\r\n');
    this.socket?.write(request);
  }

  private handleData(data: Buffer): void {
    if (!this.handshaken) {
      this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, data] as any);
      const separator = this.handshakeBuffer.indexOf('\r\n\r\n');
      if (separator < 0) return;
      const header = this.handshakeBuffer.subarray(0, separator).toString('ascii');
      if (!/^HTTP\/1\.1 101 /m.test(header)) {
        this.fail(new Error(`CDP WebSocket handshake failed: ${header.split('\r\n')[0]}`));
        return;
      }
      this.handshaken = true;
      this.resolveOpen?.();
      this.resolveOpen = undefined;
      this.rejectOpen = undefined;
      this.buffer = this.handshakeBuffer.subarray(separator + 4);
      this.handshakeBuffer = Buffer.alloc(0);
    } else {
      this.buffer = Buffer.concat([this.buffer, data] as any);
    }
    this.parseFrames();
  }

  private parseFrames(): void {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const large = this.buffer.readBigUInt64BE(2);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.fail(new Error('CDP WebSocket frame is too large'));
          return;
        }
        length = Number(large);
        offset = 10;
      }
      const maskOffset = masked ? 4 : 0;
      const frameEnd = offset + maskOffset + length;
      if (this.buffer.length < frameEnd) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : undefined;
      const bodyStart = offset + maskOffset;
      const body = Buffer.from(
        this.buffer.subarray(bodyStart, frameEnd) as unknown as Uint8Array,
      );
      if (mask) {
        for (let index = 0; index < body.length; index += 1) {
          body[index] ^= mask[index % 4];
        }
      }
      this.buffer = this.buffer.subarray(frameEnd);
      if (opcode === 0x1) {
        const payload = body.toString('utf8');
        this.messages.forEach((listener) => listener(payload));
      } else if (opcode === 0x8) {
        this.close();
        return;
      } else if (opcode === 0x9) {
        this.writeControlFrame(0xA, body);
      }
    }
  }

  private writeControlFrame(opcode: number, body: Buffer): void {
    if (!this.socket || body.length >= 126 || this.closed) return;
    const mask = crypto.randomBytes(4);
    const payload = Buffer.alloc(body.length);
    for (let index = 0; index < body.length; index += 1) {
      payload[index] = body[index] ^ mask[index % 4];
    }
    this.socket.write(
      Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | body.length]), mask, payload] as any) as any,
    );
  }

  private fail(error: Error): void {
    this.rejectOpen?.(error);
    this.rejectOpen = undefined;
    this.resolveOpen = undefined;
    this.errors.forEach((listener) => listener(error));
    this.socket?.destroy();
  }

  private handleClose(): void {
    if (this.closed) {
      this.closes.forEach((listener) => listener());
      return;
    }
    this.closed = true;
    this.closes.forEach((listener) => listener());
  }
}
