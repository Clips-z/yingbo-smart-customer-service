// 截图知识管理两个视图：商品问答库 + 店铺知识库
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:1212/main.html';
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');
const MOCK_PORT = 33848;

const now = new Date();
const MOCK_RESPONSES = {
  '/api/v1/base/platform/all': { code: 0, message: 'ok', data: [
    { id: 'win_qianniu', name: '千牛客服', platform_id: 'win_qianniu', status: 'running', running: true, instances: [{ id: 'inst_1', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wechat', name: '微信客服', platform_id: 'win_wechat', status: 'running', running: true, instances: [{ id: 'inst_2', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wecom', name: '企业微信客服', platform_id: 'win_wecom', status: 'running', running: true, instances: [{ id: 'inst_3', name: '默认实例', status: 'running', running: true }] },
  ]},
};

// 启动 mock HTTP server（供 AppManager 等组件调后端 API）
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.url;
  let mockData = null;
  if (url.includes('/api/v1/base/platform/all')) mockData = MOCK_RESPONSES['/api/v1/base/platform/all'];
  else if (url.includes('reply-mode')) mockData = { code: 0, message: 'ok', data: { mode: 'hint' } };
  else if (url.includes('health') || url.includes('collector')) mockData = { code: 0, message: 'ok', data: { state: 'running', lastError: null } };
  else if (url.includes('/api/v1/')) mockData = { code: 0, message: 'ok', data: null };
  if (mockData) { console.log('[mock-http]', url); res.end(JSON.stringify(mockData)); }
  else { res.statusCode = 404; res.end(JSON.stringify({ code: 404, message: 'not found' })); }
});
server.listen(MOCK_PORT, '127.0.0.1', () => console.log('[mock-http] on port', MOCK_PORT));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 820, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: MOCK_PRELOAD },
  });

  await win.loadURL(TARGET_URL);
  await new Promise((r) => setTimeout(r, 6000));

  // ── 截图 1：工作台（默认视图）──
  let img0 = await win.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'ui-dashboard.png'), img0.toPNG());
  console.log('✅ 截图 ui-dashboard.png（工作台）');

  // ── 导航到「知识管理 > 商品问答库」──
  await win.webContents.executeJavaScript(`
    if (window.__navigateTo) window.__navigateTo('knowledge', 'product-qa');
    else throw new Error('__navigateTo not found');
  `);
  await new Promise((r) => setTimeout(r, 2500));
  let debug1 = await win.webContents.executeJavaScript(`document.body.innerText.substring(0,400)`);
  console.log('商品问答库 DEBUG:', debug1.replace(/\\n/g,' ').slice(0,200));
  const img1 = await win.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'ui-product-qa.png'), img1.toPNG());
  console.log('✅ 截图 ui-product-qa.png（商品问答库）');

  // ── 导航到「知识管理 > 店铺知识库」──
  await win.webContents.executeJavaScript(`
    if (window.__navigateTo) window.__navigateTo('knowledge', 'store-kb');
    else throw new Error('__navigateTo not found');
  `);
  await new Promise((r) => setTimeout(r, 3000));
  let debug2 = await win.webContents.executeJavaScript(`document.body.innerText.substring(0,400)`);
  console.log('店铺知识库 DEBUG:', debug2.replace(/\\n/g,' ').slice(0,200));
  const img2 = await win.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'ui-store-kb.png'), img2.toPNG());
  console.log('✅ 截图 ui-store-kb.png（店铺知识库）');

  // ── 导航到「客服中心」──
  await win.webContents.executeJavaScript(`
    if (window.__navigateTo) window.__navigateTo('service');
    else throw new Error('__navigateTo not found');
  `);
  await new Promise((r) => setTimeout(r, 2000));
  const img3 = await win.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'ui-service.png'), img3.toPNG());
  console.log('✅ 截图 ui-service.png（客服中心）');

  // 导航检查
  const navDebug = await win.webContents.executeJavaScript(`JSON.stringify({
    hasWorkbench: document.body.innerText.includes('平台管理'),
    hasService: document.body.innerText.includes('回复工作台'),
    hasProductQA: document.body.innerText.includes('商品问答库'),
    hasStoreKB: document.body.innerText.includes('店铺知识库'),
    hasKnowledge: document.body.innerText.includes('知识管理'),
  })`);
  console.log('NAV CHECK:', navDebug);

  server.close();
  app.quit();
});
