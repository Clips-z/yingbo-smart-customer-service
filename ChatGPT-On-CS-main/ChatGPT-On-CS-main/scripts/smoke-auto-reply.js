/**
 * Smoke test the Node reply pipeline without relying on the Python collector.
 *
 * Usage:
 *   node scripts/smoke-auto-reply.js [port]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..');
let port = Number(process.argv[2]) || 0;
const probeText = `微信自动回复链路探测 ${Date.now()}`;

function findPortsFromLog() {
  const logPath = path.join(root, '.tmp-userdata', 'logs', 'electron-startup.log');
  if (!fs.existsSync(logPath)) throw new Error('No port arg and startup log missing');
  const text = fs.readFileSync(logPath, 'utf8');
  const matches = [...text.matchAll(/Server is running on http:\/\/localhost:(\d+)/g)];
  if (!matches.length) throw new Error('Port not found in startup log');
  return [...new Set(matches.map((match) => Number(match[1])).reverse())];
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
        timeout: 60000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Invalid JSON from ${urlPath}: ${raw.slice(0, 300)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${method} ${urlPath}`)));
    if (data) req.write(data);
    req.end();
  });
}

async function findLivePort() {
  const ports = findPortsFromLog();

  for (const candidate of ports) {
    port = candidate;
    try {
      // eslint-disable-next-line no-await-in-loop
      await request('GET', '/api/v1/base/health');
      return candidate;
    } catch {
      // Try the next most recent port.
    }
  }

  throw new Error(`No live API port found. Tried: ${ports.join(', ')}`);
}

async function main() {
  if (!port) {
    port = await findLivePort();
  }

  console.log(`Target: http://127.0.0.1:${port}`);
  console.log(`Probe: ${probeText}`);

  const simulate = await request('POST', '/api/v1/message/simulate', {
    platformId: 'win_wechat',
    platformName: '微信',
    instanceId: 'wechat_smoke_probe',
    sender: '微信测试用户',
    content: probeText,
  });

  if (!simulate?.success || !simulate?.data?.saved) {
    throw new Error(`message/simulate failed: ${JSON.stringify(simulate)}`);
  }

  const sessions = await request('POST', '/api/v1/message/session', {
    page: 1,
    pageSize: 5,
    platformId: 'win_wechat',
  });

  const session = sessions?.data?.rows?.[0];
  if (!session?.id) {
    throw new Error(`No session was saved: ${JSON.stringify(sessions)}`);
  }

  const messages = await request('POST', '/api/v1/message/list', {
    sessionId: session.id,
  });

  const rows = messages?.data || [];
  const hasProbe = rows.some((msg) => msg.role === 'OTHER' && msg.content === probeText);
  const hasReply = rows.some((msg) => msg.role === 'SELF' && msg.sender === 'BOT');

  console.log(
    JSON.stringify(
      {
        ok: hasProbe && hasReply,
        reply: simulate.data.reply,
        sessionId: session.id,
        messageCount: rows.length,
      },
      null,
      2,
    ),
  );

  if (!hasProbe || !hasReply) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
