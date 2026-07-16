const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');

const rendererRoot = path.join(__dirname, 'release', 'app', 'dist', 'renderer');
const mockPreload = path.join(__dirname, 'mock-preload.js');
const context = {
  platformId: 'win_qianniu', storeId: '轮越旗舰店', accountId: 'jamie',
  contactId: 'tb296401895884', chatFingerprint: 'chat-a', productId: '560120308139',
  productTitle: '二自由度二维舵机360度电动云台', storeName: '轮越旗舰店', accountName: 'jamie',
  incomingMessageFingerprint: 'message-a', contextRevision: 3,
  capturedAt: new Date().toISOString(), confidence: 0.98, state: 'stable',
  conversationKey: 'conversation-a', draftKey: 'draft-a',
};
const suggestion = {
  id: 1, platform_id: 'win_qianniu', store: '轮越旗舰店', sender: 'tb296401895884',
  incoming_content: '这个云台支持开发票吗？今天下单什么时候发货？',
  reply_content: '亲，支持开具发票。今天下单会按订单顺序尽快安排发货，如您着急，我可以先为您备注优先处理。',
  draft_content: '亲，支持开具发票。今天下单会按订单顺序尽快安排发货，如您着急，我可以先为您备注优先处理。',
  conversation_key: 'conversation-a', draft_key: 'draft-a', store_id: '轮越旗舰店',
  account_id: 'jamie', contact_id: 'tb296401895884', chat_fingerprint: 'chat-a',
  product_id: '560120308139', incoming_message_fingerprint: 'message-a', context_revision: 3,
  draft_state: 'draft', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

function json(response, body) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,cache-control',
  });
  response.end(JSON.stringify(body));
}

const api = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') return json(response, {});
  if (request.url.startsWith('/api/v1/compat/qianniu/context')) return json(response, { success: true, data: context });
  if (request.url.startsWith('/api/v1/compat/qianniu/suggestions')) return json(response, { success: true, data: [suggestion] });
  if (request.url.startsWith('/api/v1/compat/qianniu/mode')) return json(response, { success: true, data: { mode: 'assist' } });
  if (request.url.startsWith('/api/v1/knowledge/products')) return json(response, { success: true, data: { list: [{ id: 'p1', name: '二自由度二维舵机360度电动云台', platformProductId: '560120308139', shopId: '轮越旗舰店', shopName: '轮越旗舰店', onSale: true, qaCount: 8, hue: 168, syncStatus: 'synced' }], total: 1, page: 1, pageSize: 10 } });
  return json(response, { success: true });
});

const staticServer = http.createServer((request, response) => {
  const relative = request.url === '/' ? 'companion.html' : request.url.replace(/^\//, '').split('?')[0];
  const file = path.join(rendererRoot, relative);
  const extension = path.extname(file);
  const type = extension === '.html' ? 'text/html' : extension === '.js' ? 'text/javascript' : extension === '.css' ? 'text/css' : 'application/octet-stream';
  if (!fs.existsSync(file)) { response.writeHead(404); response.end('not found'); return; }
  response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
});

app.whenReady().then(async () => {
  await new Promise((resolve) => api.listen(33847, '127.0.0.1', resolve));
  await new Promise((resolve) => staticServer.listen(33848, '127.0.0.1', resolve));
  const win = new BrowserWindow({
    width: 372, height: 860, show: true, frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: mockPreload },
  });
  await win.loadURL('http://127.0.0.1:33848/companion.html');
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const image = await win.capturePage();
  if (image.isEmpty()) throw new Error('companion screenshot is empty');
  const output = path.join(__dirname, 'companion-preview.png');
  fs.writeFileSync(output, image.toPNG());
  console.log(output);
  api.close(); staticServer.close(); app.quit();
});
