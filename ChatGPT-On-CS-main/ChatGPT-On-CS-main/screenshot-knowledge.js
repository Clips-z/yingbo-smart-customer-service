// 截图知识管理全部子页面 + 内容安全 + 增强交互（使用生产构建，稳定版）
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// 使用生产构建路径（dev server 的 HMR 可能导致首次渲染空白）
const PROD_PATH = path.join(__dirname, 'release/app/dist/renderer/main.html');
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');
const MOCK_PORT = 33848;

const MOCK_RESPONSES = {
  '/api/v1/base/platform/all': { code: 0, message: 'ok', data: [
    { id: 'win_qianniu', name: '千牛客服', platform_id: 'win_qianniu', status: 'running', running: true, instances: [{ id: 'inst_1', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wechat', name: '微信客服', platform_id: 'win_wechat', status: 'running', running: true, instances: [{ id: 'inst_2', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wecom', name: '企业微信客服', platform_id: 'win_wecom', status: 'running', running: true, instances: [{ id: 'inst_3', name: '默认实例', status: 'running', running: true }] },
  ]},
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.url;
  let mockData = null;
  if (url.includes('/api/v1/base/platform/all')) mockData = MOCK_RESPONSES['/api/v1/base/platform/all'];
  else if (url.includes('reply-mode')) mockData = { code: 0, message: 'ok', data: { mode: 'hint' } };
  else if (url.includes('health') || url.includes('collector')) mockData = { code: 0, message: 'ok', data: { state: 'running', lastError: null } };
  else if (url.includes('/api/v1/')) mockData = { code: 0, message: 'ok', data: null };
  if (mockData) { res.end(JSON.stringify(mockData)); } else { res.statusCode = 404; res.end(JSON.stringify({ code: 404, message: 'not found' })); }
});
server.listen(MOCK_PORT, '127.0.0.1', () => console.log('[mock-http] on', MOCK_PORT));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 导航：容错 */
const nav = async (win, section, sub) => {
  try {
    await win.webContents.executeJavaScript(`try{window.__navigateTo(${JSON.stringify(section)}, ${sub ? JSON.stringify(sub) : 'undefined'})}catch(e){}`);
    return true;
  } catch(e) { return false; }
};
/** 点击按钮：容错 */
const clickByText = async (win, text) => {
  try {
    const r = await win.webContents.executeJavaScript(`
      (function(){
        try{
          var els=Array.from(document.querySelectorAll('button,[role="button"]'));
          var el=els.find(function(e){var t=e.textContent;return t&&t.trim()===${JSON.stringify(text)}});
          if(el){el.click();return true;}
          var el2=els.find(function(e){var t=e.textContent;return t&&t.trim().includes(${JSON.stringify(text)})});
          if(el2){el2.click();return true;}
          return false;
        }catch(e){return false;}
      })()
    `);
    return !!r;
  } catch(e) { return false; }
};
/** 截图：容错 */
const shot = async (win, name) => {
  try {
    const img = await win.capturePage();
    require('fs').writeFileSync(path.join(__dirname, name), img.toPNG());
    return true;
  } catch(e) { return false; }
};

const steps = [
  ['industry-config', 'ui-industry.png'],
  ['validity', 'ui-validity.png'],
  ['corpus-test', 'ui-corpus.png'],
  ['product-qa', 'ui-product-qa2.png'],
  ['store-kb', 'ui-store-kb2.png'],
  ['security', 'ui-security.png'],
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 820, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: MOCK_PRELOAD },
  });
  try {
    // 加载生产构建（稳定、无 HMR）
    await win.loadFile(PROD_PATH);
    // 等待 React 水合 + 健康检查 + 首次渲染
    await wait(8000);

    // 截图：工作台（默认视图）
    await shot(win, 'ui-dashboard2.png');

    // 知识管理子页面
    for (const [sub, file] of steps) {
      await nav(win, 'knowledge', sub);
      await wait(2500);
      await shot(win, file);
      console.log('✅', file);
    }

    // 客服中心
    await nav(win, 'service');
    await wait(2000);
    await shot(win, 'ui-service2.png');

    // 商品问答库 → 「添加商品」弹窗
    await nav(win, 'knowledge', 'product-qa');
    await wait(2000);
    await clickByText(win, '添加商品');
    await wait(1500);
    await shot(win, 'ui-product-add.png');
    console.log('✅ ui-product-add.png');

    // 店铺知识库 → 「新增问答」弹窗
    await nav(win, 'knowledge', 'store-kb');
    await wait(2000);
    await clickByText(win, '新增问答');
    await wait(1500);
    await shot(win, 'ui-store-add.png');
    console.log('✅ ui-store-add.png');

    console.log('🎉 ALL SCREENSHOTS DONE');
  } catch (e) {
    console.log('❌ fatal:', e.message);
  } finally {
    server.close();
    win.destroy();
    app.quit();
  }
});
