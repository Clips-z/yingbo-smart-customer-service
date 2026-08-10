export interface CdpTarget {
  id: string;
  type: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
  targetId?: string;
  attached?: boolean;
}

export interface CdpVersion {
  Browser?: string;
  'Protocol-Version'?: string;
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

export interface CdpEndpointInfo {
  baseUrl: string;
  version: CdpVersion;
  targets: CdpTarget[];
  checkedAt: string;
}

export interface CdpProbeResult {
  ok: boolean;
  endpoint?: CdpEndpointInfo;
  error?: string;
}

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface CdpSocket {
  open(): Promise<void>;
  send(payload: string): void;
  close(): void;
  onMessage(listener: (payload: string) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  onClose(listener: () => void): () => void;
}
