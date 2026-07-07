/**
 * E2E: configure global LLM from local secrets, then test /api/v1/base/plugin/check
 *
 * Usage:
 *   node scripts/e2e-plugin-check.js [port]
 *
 * LLM config resolution order:
 *   1. .tmp-userdata/llm.local.json  { baseUrl, key, llmType, model }
 *   2. Parse "Creating LLM client:" block from .tmp-userdata/logs/electron-startup.log
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || findPortFromLog();
const base = `http://127.0.0.1:${port}`;

function findPortFromLog() {
  const logPath = path.join(root, '.tmp-userdata', 'logs', 'electron-startup.log');
  if (!fs.existsSync(logPath)) throw new Error('No port arg and startup log missing');
  const matches = [...fs.readFileSync(logPath, 'utf8').matchAll(/Server is running on http:\/\/localhost:(\d+)/g)];
  if (!matches.length) throw new Error('Port not found in startup log');
  return Number(matches[matches.length - 1][1]);
}

function loadLlmCfg() {
  const localPath = path.join(root, '.tmp-userdata', 'llm.local.json');
  if (fs.existsSync(localPath)) {
    const cfg = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    if (cfg.key) return cfg;
  }

  const logPath = path.join(root, '.tmp-userdata', 'logs', 'electron-startup.log');
  if (!fs.existsSync(logPath)) throw new Error('No llm.local.json and no startup log');

  const text = fs.readFileSync(logPath, 'utf8');
  const idx = text.lastIndexOf('Creating LLM client:');
  if (idx === -1) throw new Error('No "Creating LLM client" entry in startup log');

  const block = text.slice(idx);
  const keyMatch = block.match(/key:\s*'([^']+)'/);
  const baseUrlMatch = block.match(/baseUrl:\s*'([^']+)'/);
  const llmTypeMatch = block.match(/llmType:\s*'([^']+)'/);
  const modelMatch = block.match(/model:\s*'([^']+)'/);

  if (!keyMatch) throw new Error('Could not parse LLM key from startup log');

  return {
    baseUrl: baseUrlMatch?.[1] || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    key: keyMatch[1],
    llmType: llmTypeMatch?.[1] || 'openai',
    model: modelMatch?.[1] || 'qwen-turbo',
  };
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
        timeout: 120000,
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
            reject(new Error(`Invalid JSON from ${urlPath}: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${urlPath}`)));
    if (data) req.write(data);
    req.end();
  });
}

const PLUGIN_CODE = `const cc = require('config_srv');
const rp = require('reply_srv');

async function main(ctx, messages) {
  const cfg = await cc.get(ctx);
  return await rp.getReply(cfg, ctx, messages);
}`;

async function main() {
  console.log(`Target: ${base}`);

  const health = await request('GET', '/api/v1/base/health');
  if (!health?.success) throw new Error(`App not healthy on port ${port}`);

  const llmCfg = loadLlmCfg();
  console.log(`LLM: ${llmCfg.llmType} / ${llmCfg.model} @ ${llmCfg.baseUrl} (key len=${llmCfg.key.length})`);

  const gptHealth = await request('POST', '/api/v1/base/gpt/health', { cfg: llmCfg });
  console.log('gpt/health:', JSON.stringify({ status: gptHealth.status, messageLen: (gptHealth.message || '').length }));
  if (!gptHealth.status) throw new Error(`gpt/health failed: ${gptHealth.message}`);

  await request('POST', '/api/v1/base/setting', { type: 'llm', cfg: llmCfg });
  await request('POST', '/api/v1/base/setting', {
    type: 'driver',
    cfg: {
      hasPaused: false,
      hasKeywordMatch: false,
      hasUseGpt: true,
      hasMouseClose: false,
      hasEscClose: false,
      hasTransfer: false,
      hasReplace: false,
    },
  });
  await request('POST', '/api/v1/base/setting', {
    type: 'generic',
    cfg: {
      extractPhone: false,
      extractProduct: false,
      savePath: '',
      replySpeed: 0,
      replyRandomSpeed: 0,
      contextCount: 10,
      waitHumansTime: 0,
      defaultReply: '当前消息有点多，我稍后再回复你',
      truncateWordCount: 0,
      truncateWordKey: '',
      jinritemaiDefaultReplyMatch: '',
    },
  });
  console.log('Global config written (llm + driver + generic)');

  const pluginResp = await request('POST', '/api/v1/base/plugin/check', {
    code: PLUGIN_CODE,
    ctx: {
      CTX_APP_NAME: 'mock',
      CTX_APP_ID: 'mock_app_id',
      CTX_INSTANCE_ID: 'mock_instance_id',
    },
    messages: [
      {
        sender: 'OTHER用户',
        content: '请问你们的退货政策是什么？',
        role: 'OTHER',
        type: 'TEXT',
      },
    ],
  });

  console.log('plugin/check result:');
  console.log(JSON.stringify(pluginResp, null, 2));

  if (!pluginResp.status) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
