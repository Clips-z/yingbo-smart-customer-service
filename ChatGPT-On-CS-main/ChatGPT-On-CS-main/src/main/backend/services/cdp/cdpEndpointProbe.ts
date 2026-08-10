import http from 'http';
import https from 'https';
import { CdpEndpointInfo, CdpProbeResult, CdpTarget, CdpVersion } from './cdpTypes';

function requestJson(url: string, timeoutMs: number): Promise<unknown> {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(
      parsed,
      { headers: { Accept: 'application/json' } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
            reject(new Error(`HTTP ${response.statusCode || 500} from ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('CDP endpoint timeout')));
    request.on('error', reject);
  });
}

export async function probeCdpEndpoint(
  baseUrl: string,
  timeoutMs = 1_500,
): Promise<CdpProbeResult> {
  const normalized = baseUrl.replace(/\/$/, '');
  try {
    const [version, targets] = await Promise.all([
      requestJson(`${normalized}/json/version`, timeoutMs),
      requestJson(`${normalized}/json/list`, timeoutMs),
    ]);
    const typedVersion = version as CdpVersion;
    const typedTargets = Array.isArray(targets) ? (targets as CdpTarget[]) : [];
    const endpoint: CdpEndpointInfo = {
      baseUrl: normalized,
      version: typedVersion,
      targets: typedTargets,
      checkedAt: new Date().toISOString(),
    };
    return {
      ok: Boolean(typedVersion.webSocketDebuggerUrl || typedTargets.some((target) => target.webSocketDebuggerUrl)),
      endpoint,
      error:
        typedVersion.webSocketDebuggerUrl || typedTargets.some((target) => target.webSocketDebuggerUrl)
          ? undefined
          : 'CDP endpoint returned no WebSocket targets',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function discoverCdpPorts(
  ports: number[],
  host = '127.0.0.1',
): Promise<CdpProbeResult[]> {
  return Promise.all(ports.map((port) => probeCdpEndpoint(`http://${host}:${port}`)));
}
