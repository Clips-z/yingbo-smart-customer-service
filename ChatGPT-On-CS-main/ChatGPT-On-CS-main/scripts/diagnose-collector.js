/**
 * Diagnose the local collector bridge.
 *
 * Usage:
 *   node scripts/diagnose-collector.js [port] [platformId] [--sync]
 *
 * By default the script is read-only. Pass --sync to trigger collector sync/run.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const shouldSync = args.includes('--sync');
const portArg = args.find((arg) => /^\d+$/.test(arg));
const platformArg = args.find((arg) => !/^\d+$/.test(arg) && !arg.startsWith('--'));
let port = Number(portArg) || 0;
const platformId = platformArg || 'win_qianniu';

function findPortsFromLog() {
  const logPath = path.join(root, '.tmp-userdata', 'logs', 'electron-startup.log');
  if (!fs.existsSync(logPath)) {
    throw new Error('No port argument and electron-startup.log is missing');
  }

  const text = fs.readFileSync(logPath, 'utf8');
  const matches = [...text.matchAll(/Server is running on http:\/\/localhost:(\d+)/g)];
  if (!matches.length) {
    throw new Error('Could not find local API port in electron-startup.log');
  }

  return [...new Set(matches.map((match) => Number(match[1])).reverse())];
}

function readTail(filePath, lineCount = 80) {
  if (!fs.existsSync(filePath)) return [`Missing log: ${filePath}`];
  const text = fs.readFileSync(filePath, 'utf8');
  return text.trimEnd().split(/\r?\n/).slice(-lineCount).map(redactSecrets);
}

function redactSecrets(line) {
  return line
    .replace(/(key:\s*['"]?)([^'",\s}]+)/gi, '$1<redacted>')
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)([^'",\s}]+)/gi, '$1<redacted>')
    .replace(/(authorization["']?\s*[:=]\s*["']?Bearer\s+)([^'",\s}]+)/gi, '$1<redacted>');
}

function request(method, urlPath, body) {
  return new Promise((resolve) => {
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
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ ok: true, status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ ok: false, status: res.statusCode, error: raw.slice(0, 500) });
          }
        });
      },
    );

    req.on('error', (error) => resolve({ ok: false, error: error.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: `Timeout: ${method} ${urlPath}` });
    });

    if (data) req.write(data);
    req.end();
  });
}

async function findLivePort() {
  const ports = findPortsFromLog();

  for (const candidate of ports) {
    port = candidate;
    // eslint-disable-next-line no-await-in-loop
    const health = await request('GET', '/api/v1/base/health');
    if (health.ok) {
      return candidate;
    }
  }

  throw new Error(`No live API port found. Tried: ${ports.join(', ')}`);
}

async function main() {
  if (!port) {
    port = await findLivePort();
  }

  console.log(`Local API: http://127.0.0.1:${port}`);
  console.log(`Platform session probe: ${platformId}`);
  console.log(`Trigger sync: ${shouldSync ? 'yes' : 'no'}`);

  const builtInDiagnostic = await request('POST', '/api/v1/base/collector/diagnose', {
    platformId,
    logLines: 80,
    sync: shouldSync,
  });

  if (builtInDiagnostic.ok && builtInDiagnostic.status === 200) {
    console.log('\n[collector diagnose]');
    console.log(JSON.stringify(builtInDiagnostic.data, null, 2));
    return;
  }

  console.log('\n[collector diagnose unavailable, falling back]');
  console.log(JSON.stringify(builtInDiagnostic, null, 2));

  const health = await request('GET', '/api/v1/base/health');
  console.log('\n[health]');
  console.log(JSON.stringify(health, null, 2));

  const tasks = await request('GET', '/api/v1/strategy/tasks');
  console.log('\n[tasks]');
  console.log(JSON.stringify(tasks, null, 2));

  if (shouldSync) {
    const sync = await request('POST', '/api/v1/base/sync');
    console.log('\n[sync]');
    console.log(JSON.stringify(sync, null, 2));
  }

  const sessions = await request('POST', '/api/v1/message/session', {
    page: 1,
    pageSize: 20,
    platformId,
  });
  console.log('\n[sessions]');
  console.log(JSON.stringify(sessions, null, 2));

  const electronLog = path.join(root, '.tmp-userdata', 'logs', 'electron-startup.log');
  const collectorLog = path.join(os.tmpdir(), 'chatgpt-on-cs', 'process.log');

  console.log('\n[electron-startup.log tail]');
  console.log(readTail(electronLog).join('\n'));

  console.log('\n[collector process.log tail]');
  console.log(readTail(collectorLog).join('\n'));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
