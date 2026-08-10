import crypto from 'crypto';

export type QianniuOfficialContact = {
  securityUID: string;
  bizDomain: string;
  userNick?: string;
  observedAt: number;
};

export type QianniuOfficialFillCommand = {
  id: string;
  type: 'fill';
  securityUID: string;
  bizDomain: string;
  userNick?: string;
  content: string;
  createdAt: number;
  expiresAt: number;
};

export type QianniuOfficialFocusCommand = {
  id: string;
  type: 'focus';
  securityUID: string;
  bizDomain: string;
  userNick?: string;
  createdAt: number;
  expiresAt: number;
};

export type QianniuOfficialCommand =
  | QianniuOfficialFillCommand
  | QianniuOfficialFocusCommand;

export type QianniuOfficialCommandResult = {
  commandId: string;
  ok: boolean;
  error?: string;
};

type PendingCommand = {
  command: QianniuOfficialCommand;
  state: 'queued' | 'dispatched';
  resolve: (result: QianniuOfficialCommandResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type ContactObservation = {
  securityUID: string;
  bizDomain: string;
  userNick?: string;
};

type FillRequest = {
  expectedSecurityUID?: string;
  expectedUserNick?: string;
  content: string;
};

export type QianniuOfficialRuntime = 'miniapp' | 'legacy-jssdk';

function sameText(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  const normalize = (value: string) =>
    value
      .replace(/\s+/g, '')
      .replace(/^(cntaobao|cnalichn|enaliint)/i, '')
      .toLowerCase();
  return normalize(left) === normalize(right);
}

export class QianniuOfficialBridge {
  private clientId?: string;

  private lastHeartbeatAt?: number;

  private runtime?: QianniuOfficialRuntime;

  private currentContact?: QianniuOfficialContact;

  private readonly knownContacts = new Map<string, QianniuOfficialContact>();

  private readonly pending = new Map<string, PendingCommand>();

  constructor(
    private readonly heartbeatTtlMs = 5_000,
    private readonly commandTimeoutMs = 5_000,
  ) {}

  public heartbeat(
    clientId: string,
    runtime?: QianniuOfficialRuntime,
    now = Date.now(),
  ): void {
    const normalized = clientId.trim();
    if (!normalized) throw new Error('官方桥接 clientId 不能为空');
    this.clientId = normalized;
    if (runtime) this.runtime = runtime;
    this.lastHeartbeatAt = now;
  }

  public observeContact(
    input: ContactObservation,
    now = Date.now(),
  ): QianniuOfficialContact {
    const securityUID = input.securityUID.trim();
    const bizDomain = input.bizDomain.trim();
    const userNick = input.userNick?.trim();
    if (!securityUID || !bizDomain) {
      throw new Error('官方桥接联系人缺少 securityUID 或 bizDomain');
    }
    const contact: QianniuOfficialContact = {
      securityUID,
      bizDomain,
      observedAt: now,
    };
    if (userNick) contact.userNick = userNick;
    this.currentContact = contact;
    this.knownContacts.set(`${bizDomain}:${securityUID}`, contact);
    return { ...contact };
  }

  public getHealth(now = Date.now()) {
    const connected = Boolean(
      this.clientId &&
        typeof this.lastHeartbeatAt === 'number' &&
        now - this.lastHeartbeatAt <= this.heartbeatTtlMs,
    );
    return {
      connected,
      ...(this.clientId ? { clientId: this.clientId } : {}),
      ...(typeof this.lastHeartbeatAt === 'number'
        ? { lastHeartbeatAt: this.lastHeartbeatAt }
        : {}),
      ...(this.runtime ? { runtime: this.runtime } : {}),
      ...(this.currentContact
        ? { currentContact: { ...this.currentContact } }
        : {}),
      pendingCount: this.pending.size,
      source: 'official-plugin' as const,
    };
  }

  public requestFill(input: FillRequest): Promise<QianniuOfficialCommandResult> {
    const health = this.getHealth();
    if (!health.connected) {
      return Promise.reject(new Error('千牛官方桥接未连接'));
    }
    const contact = this.currentContact;
    if (!contact) {
      return Promise.reject(new Error('千牛官方桥接尚未获得当前客户'));
    }
    const securityMatches = input.expectedSecurityUID
      ? sameText(input.expectedSecurityUID, contact.securityUID)
      : false;
    const nickMatches = input.expectedUserNick
      ? sameText(input.expectedUserNick, contact.userNick)
      : false;
    if (!securityMatches && !nickMatches) {
      return Promise.reject(new Error('官方桥接当前客户不匹配'));
    }
    const content = input.content.trim().slice(0, 300);
    if (!content) return Promise.reject(new Error('填入内容不能为空'));

    const now = Date.now();
    const command: QianniuOfficialFillCommand = {
      id: crypto.randomUUID(),
      type: 'fill',
      securityUID: contact.securityUID,
      bizDomain: contact.bizDomain,
      content,
      createdAt: now,
      expiresAt: now + this.commandTimeoutMs,
    };
    if (contact.userNick) command.userNick = contact.userNick;

    return new Promise<QianniuOfficialCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        reject(new Error('官方桥接填入超时'));
      }, this.commandTimeoutMs);
      this.pending.set(command.id, {
        command,
        state: 'queued',
        resolve,
        reject,
        timer,
      });
    });
  }

  public requestFocus(expectedUserNick: string): Promise<QianniuOfficialCommandResult> {
    if (!this.getHealth().connected) {
      return Promise.reject(new Error('千牛官方桥接未连接'));
    }
    const target = [...this.knownContacts.values()].find(
      (contact) =>
        sameText(expectedUserNick, contact.userNick) ||
        sameText(expectedUserNick, contact.securityUID),
    );
    if (!target) {
      return Promise.reject(new Error('官方桥接尚未缓存目标客户身份'));
    }
    const now = Date.now();
    const command: QianniuOfficialFocusCommand = {
      id: crypto.randomUUID(),
      type: 'focus',
      securityUID: target.securityUID,
      bizDomain: target.bizDomain,
      createdAt: now,
      expiresAt: now + this.commandTimeoutMs,
    };
    if (target.userNick) command.userNick = target.userNick;
    return this.queueCommand(command);
  }

  public matchesCurrentContact(expected: string): boolean {
    return Boolean(
      this.currentContact &&
        (sameText(expected, this.currentContact.userNick) ||
          sameText(expected, this.currentContact.securityUID)),
    );
  }

  public pollCommand(
    clientId: string,
    now = Date.now(),
  ): QianniuOfficialCommand | undefined {
    const normalized = clientId.trim();
    if (
      this.clientId &&
      this.clientId !== normalized &&
      this.getHealth(now).connected
    ) {
      return undefined;
    }
    this.heartbeat(normalized, undefined, now);
    const pending = [...this.pending.values()].find(
      (item) => item.state === 'queued' && item.command.expiresAt >= now,
    );
    if (!pending) return undefined;
    pending.state = 'dispatched';
    return { ...pending.command };
  }

  public completeCommand(
    clientId: string,
    result: QianniuOfficialCommandResult,
    now = Date.now(),
  ): void {
    if (this.clientId !== clientId.trim()) {
      throw new Error('官方桥接客户端不匹配');
    }
    this.heartbeat(clientId, undefined, now);
    const pending = this.pending.get(result.commandId);
    if (!pending) throw new Error('官方桥接命令不存在或已过期');
    clearTimeout(pending.timer);
    this.pending.delete(result.commandId);
    if (result.ok) {
      pending.resolve({ commandId: result.commandId, ok: true });
      return;
    }
    pending.reject(new Error(result.error?.trim() || '官方桥接填入失败'));
  }

  public stop(): void {
    this.clientId = undefined;
    this.lastHeartbeatAt = undefined;
    this.runtime = undefined;
    this.currentContact = undefined;
    this.knownContacts.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('千牛官方桥接已停止'));
    }
    this.pending.clear();
  }

  private queueCommand(
    command: QianniuOfficialCommand,
  ): Promise<QianniuOfficialCommandResult> {
    return new Promise<QianniuOfficialCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        reject(new Error('官方桥接命令超时'));
      }, this.commandTimeoutMs);
      this.pending.set(command.id, {
        command,
        state: 'queued',
        resolve,
        reject,
        timer,
      });
    });
  }
}
