// 截图知识管理全部子页面 + 内容安全 + 增强交互（使用生产构建，稳定版）
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

// The Electron process may outlive the launching terminal.  Ignore only the
// harmless broken-pipe error so screenshot jobs never show a main-process
// JavaScript dialog on the user's desktop.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on('error', (error) => {
    if (error.code !== 'EPIPE') throw error;
  });
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// 使用生产构建路径（dev server 的 HMR 可能导致首次渲染空白）
const PROD_PATH = path.join(__dirname, 'release/app/dist/renderer/main.html');
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');
const MOCK_PORT = 33847;

const MOCK_RESPONSES = {
  '/api/v1/base/platform/all': { success: true, data: [
    { id: 'win_qianniu', name: '千牛客服', platform_id: 'win_qianniu', status: 'running', running: true, instances: [{ id: 'inst_1', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wechat', name: '微信客服', platform_id: 'win_wechat', status: 'running', running: true, instances: [{ id: 'inst_2', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wecom', name: '企业微信客服', platform_id: 'win_wecom', status: 'running', running: true, instances: [{ id: 'inst_3', name: '默认实例', status: 'running', running: true }] },
  ]},
  '/api/v1/knowledge/products': { success: true, data: {
    list: [
      { id: 'p1', name: '轻量折叠代步车', platformProductId: 'SKU-20260701', barcode: '697000000001', shopId: 'shop_lixixi', shopName: '李西西旗舰店', tags: ['热卖', '出行'], onSale: true, qaCount: 18, hue: 215, syncStatus: 'synced' },
      { id: 'p2', name: '智能控制器套装', platformProductId: 'SKU-20260702', shopId: 'shop_xinghe', shopName: '星河数码', tags: ['配件'], onSale: true, qaCount: 9, hue: 265, syncStatus: 'pending' },
      { id: 'p3', name: '可调节舒适座椅', platformProductId: 'SKU-20260703', shopId: 'shop_muzhi', shopName: '木之语家居', tags: ['售后'], onSale: false, qaCount: 6, hue: 155, syncStatus: 'failed', syncError: 'RAG 服务暂时不可用，可点击重试' },
    ], total: 3, page: 1, pageSize: 20,
  }},
  '/api/v1/knowledge/store-qa': { success: true, data: {
    list: [
      { id: 'q1', question: '产品支持几天无理由退换？', answer: '商品保持完好且不影响二次销售时，支持 7 天无理由退换。', relatedQuestions: ['可以退货吗', '退换货政策'], tags: ['退换货'], triggerCount: 126, stage: 'aftersale', matchType: 'fuzzy', updatedAt: new Date().toISOString(), shopId: 'shop_lixixi', enabled: true, syncStatus: 'synced' },
      { id: 'q2', question: '下单后多久可以发货？', answer: '现货订单通常在 24 小时内安排发出，节假日顺延。', relatedQuestions: ['什么时候发货'], tags: ['物流'], triggerCount: 88, stage: 'mid', matchType: 'fuzzy', updatedAt: new Date().toISOString(), shopId: 'shop_lixixi', enabled: true, syncStatus: 'pending' },
      { id: 'q3', question: '如何选择适合的型号？', answer: '请提供使用场景、身高体重和预算，客服会协助推荐。', relatedQuestions: ['型号怎么选'], tags: ['选购'], triggerCount: 53, stage: 'presale', matchType: 'fuzzy', updatedAt: new Date().toISOString(), shopId: 'shop_xinghe', enabled: true, syncStatus: 'failed', syncError: '等待 RAG 服务恢复' },
    ], total: 3, stats: { total: 3, presale: 1, mid: 1, aftersale: 1 }, page: 1, pageSize: 20,
  }},
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.url;
  let mockData = null;
  if (url.includes('/api/v1/base/platform/all')) mockData = MOCK_RESPONSES['/api/v1/base/platform/all'];
  else if (url.includes('/api/v1/base/setting')) mockData = { success: true, data: {
    hasPaused: false, hasKeywordMatch: true, hasUseGpt: true,
    hasMouseClose: true, hasEscClose: true, hasTransfer: true, hasReplace: true,
  }};
  else if (url.includes('/api/v1/knowledge/products')) mockData = MOCK_RESPONSES['/api/v1/knowledge/products'];
  else if (url.includes('/api/v1/knowledge/store-qa')) mockData = MOCK_RESPONSES['/api/v1/knowledge/store-qa'];
  else if (url.includes('reply-mode') || url.includes('/mode')) mockData = { success: true, data: { mode: 'assist' } };
  else if (url.includes('suggestions')) mockData = { success: true, data: [] };
  else if (url.includes('health') || url.includes('collector')) mockData = { success: true, data: { state: 'running', processRunning: true, lastError: null, restartAttempts: 0 } };
  else if (url.includes('/api/v1/')) mockData = { success: true, data: null };
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
  const img = await win.capturePage();
  if (img.isEmpty()) throw new Error(`empty screenshot: ${name}`);
  require('fs').writeFileSync(path.join(__dirname, name), img.toPNG());
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
    width: 1280, height: 820, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: MOCK_PRELOAD },
  });
  try {
    // 加载生产构建（稳定、无 HMR）
    await win.loadFile(PROD_PATH);
    // 等待 React 水合 + 健康检查 + 首次渲染
    await wait(8000);
    win.setSize(1280, 820);
    await wait(500);

    // 截图：工作台（默认视图）
    await shot(win, 'ui-dashboard2.png');

    // 知识管理子页面
    for (const [sub, file] of steps) {
      if (sub === 'security') await nav(win, 'security');
      else await nav(win, 'knowledge', sub);
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
    process.exitCode = 1;
  } finally {
    server.close();
    win.destroy();
    app.quit();
  }
});
