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
  '/api/v1/knowledge/candidates': { success: true, data: {
    list: [{ id: 'candidate-1', question: '下单后多久可以发货？', answer: '现货订单通常在 24 小时内发出。', relatedQuestions: ['什么时候发货'], tags: ['物流', '发货'], stage: 'mid', shopId: 'shop_lixixi', sourceCount: 8, confidence: 0.92, evidenceReplyIds: [101, 108], evidence: [{ id: 101, question: '今天下单什么时候发货？', capturedAt: new Date().toISOString() }, { id: 108, question: '现货多久能寄出？', capturedAt: new Date().toISOString() }], status: 'pending', updatedAt: new Date().toISOString() }],
    total: 1,
  }},
  '/api/v1/governance/backups': { success: true, data: [
    { id: 'backup-1', size: 245760, sha256: 'a0c53f28d31a4f5fbc69078db1fc938f', createdAt: new Date().toISOString(), valid: true },
  ]},
};

let lastExportUrl = '';
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
  else if (url.includes('/api/v1/knowledge/export')) { lastExportUrl = url; mockData = { success: true }; }
  else if (url.includes('/api/v1/knowledge/product/p1/versions')) mockData = { success: true, data: [
    { id: 'product-version-1', version: 2, action: 'update', created_at: new Date().toISOString() },
    { id: 'product-version-0', version: 1, action: 'create', created_at: new Date(Date.now() - 60000).toISOString() },
  ] };
  else if (url.includes('/api/v1/knowledge/products')) mockData = MOCK_RESPONSES['/api/v1/knowledge/products'];
  else if (url.includes('/api/v1/knowledge/store/q1/versions')) mockData = { success: true, data: [
    { id: 'version-1', version: 2, action: 'update', created_at: new Date().toISOString() },
  ] };
  else if (url.includes('/api/v1/knowledge/store-qa/merge/preview')) mockData = { success: true, data: {
    target: MOCK_RESPONSES['/api/v1/knowledge/store-qa'].data.list[0],
    source: MOCK_RESPONSES['/api/v1/knowledge/store-qa'].data.list[1],
    merged: MOCK_RESPONSES['/api/v1/knowledge/store-qa'].data.list[0],
  } };
  else if (url.includes('/api/v1/knowledge/store-qa')) mockData = MOCK_RESPONSES['/api/v1/knowledge/store-qa'];
  else if (url.includes('/api/v1/knowledge/candidates')) mockData = MOCK_RESPONSES['/api/v1/knowledge/candidates'];
  else if (url.includes('/api/v1/governance/backups')) mockData = MOCK_RESPONSES['/api/v1/governance/backups'];
  else if (url.includes('/api/v1/governance/audit')) mockData = { success: true, data: [] };
  else if (url.includes('reply-mode') || url.includes('/mode')) mockData = { success: true, data: { mode: 'assist' } };
  else if (url.includes('suggestions')) mockData = { success: true, data: [
    { id: 101, sender: '买家小明', incoming_content: '这个衣服会缩水吗？', reply_content: '正常洗涤不会缩水哦。', status: 'pending', platform_id: 'win_qianniu', created_at: new Date().toISOString() },
    { id: 102, sender: '老客户王哥', incoming_content: '礼盒已经收到了', reply_content: '感谢您的支持！', status: 'sent', platform_id: 'win_qianniu', created_at: new Date(Date.now() - 60000).toISOString() },
  ] };
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
  ['knowledge-candidates', 'ui-candidates.png'],
  ['governance', 'ui-governance.png'],
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

    await nav(win, 'knowledge', 'knowledge-candidates');
    await wait(1500);
    if (!await clickByText(win, '审核并批准')) throw new Error('candidate review button not found');
    await wait(800);
    if (!await win.webContents.executeJavaScript("(function() { const el = document.querySelector('[role=dialog]'); if (!el) return false; const rect = el.getBoundingClientRect(); const style = getComputedStyle(el); return rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0 && el.innerText.includes('今天下单什么时候发货？') && el.innerText.includes('现货多久能寄出？') && el.innerText.includes('相似问法'); })()")) throw new Error('candidate evidence or editable details not shown');
    await shot(win, 'ui-candidate-review-details.png');
    if (!await clickByText(win, '取消')) throw new Error('candidate review cancel not found');
    await wait(500);
    if (!await clickByText(win, '驳回')) throw new Error('candidate reject button not found');
    await wait(500);
    await shot(win, 'ui-candidate-reject.png');
    console.log('✅ ui-candidate-reject.png');

    await nav(win, 'knowledge', 'governance');
    await wait(1500);
    if (!await clickByText(win, '重建 RAG 索引')) throw new Error('RAG rebuild button not found');
    await wait(500);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('确认重建 RAG 索引')")) throw new Error('RAG rebuild confirmation not shown');
    await shot(win, 'ui-rag-rebuild-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('RAG rebuild cancel not found');
    await wait(300);
    if (!await clickByText(win, '恢复')) throw new Error('backup restore button not found');
    await wait(500);
    await shot(win, 'ui-backup-restore.png');
    console.log('✅ ui-backup-restore.png');

    await nav(win, 'knowledge', 'product-qa');
    await wait(1000);
    const copySucceeded = await win.webContents.executeJavaScript(`
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async function(text) { window.__copiedProductId = text; } } });
      document.querySelector('[aria-label="复制ID"]')?.click();
      true;
    `);
    await wait(300);
    const copiedId = await win.webContents.executeJavaScript('window.__copiedProductId');
    const successToast = await win.webContents.executeJavaScript("document.body.innerText.includes('已复制商品ID')");
    if (!copySucceeded || !copiedId || !successToast) throw new Error('product ID copy success feedback failed');
    await win.webContents.executeJavaScript(`
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async function() { throw new Error('denied'); } } });
      document.querySelector('[aria-label="复制ID"]')?.click();
    `);
    await wait(300);
    const failureToast = await win.webContents.executeJavaScript("document.body.innerText.includes('复制失败')");
    if (!failureToast) throw new Error('product ID copy failure feedback failed');
    await shot(win, 'ui-product-copy-failed.png');
    console.log('✅ ui-product-copy-failed.png');

    if (!await clickByText(win, '查看版本历史')) throw new Error('product version history button not found');
    await wait(400);
    if (!await clickByText(win, '回滚')) throw new Error('product version rollback button not found');
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('确认回滚商品知识')")) throw new Error('product rollback confirmation not shown');
    await shot(win, 'ui-product-rollback-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('product rollback cancel not found');
    await wait(300);
    console.log('✅ product version history');

    lastExportUrl = '';
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"导出知识\"]')?.click()");
    await wait(300);
    await shot(win, 'ui-product-export-menu.png');
    if (!await clickByText(win, '导出全部内容 · CSV')) throw new Error('product full CSV export option not found');
    await wait(500);
    if (!lastExportUrl.includes('kind=product&format=csv') || /keyword=|shop=|status=/.test(lastExportUrl)) throw new Error(`product full CSV export request invalid: ${lastExportUrl}`);
    console.log('✅ product full CSV export');

    // 客服中心
    await nav(win, 'service');
    await wait(1000);
    for (let i = 0; i < 3; i++) {
      await win.webContents.executeJavaScript(`window.__globalStore?.setState({ activePlatformId: 'win_qianniu', activePlatformIds: ['win_qianniu'] })`);
      await wait(500);
    }
    await wait(2000);
    await shot(win, 'ui-service2.png');

    if (!await clickByText(win, '无人值守')) throw new Error('unattended mode button not found');
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('确认开启无人值守')")) throw new Error('unattended confirmation not shown');
    await shot(win, 'ui-unattended-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('unattended confirmation cancel not found');
    await wait(500);

    if (!await clickByText(win, '全选')) throw new Error('select all button not found');
    await wait(200);
    if (!await clickByText(win, '删除选中')) throw new Error('batch delete button not found');
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('删除选中记录')")) throw new Error('batch delete confirmation not shown');
    if (!await clickByText(win, '取消')) throw new Error('batch delete confirmation cancel not found');
    await wait(500);

    if (!await clickByText(win, '清空已处理')) throw new Error('clear handled button not found');
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('清空已处理记录')")) throw new Error('clear handled confirmation not shown');
    await shot(win, 'ui-workbench-clear-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('clear handled confirmation cancel not found');
    await wait(500);
    if (await win.webContents.executeJavaScript("Boolean(document.querySelector('[role=alertdialog]'))")) throw new Error('clear handled confirmation did not close');
    console.log('✅ workbench confirmations');

    const notificationClicked = await win.webContents.executeJavaScript("(function() { const el = document.querySelector('[aria-label=\"查看通知与待办\"]'); if (!el) return false; el.click(); return true; })()");
    await wait(1000);
    if (!notificationClicked || !await win.webContents.executeJavaScript("document.body.innerText.includes('今日待办') && !document.body.innerText.includes('回复工作台')")) throw new Error('notification shortcut did not open dashboard tasks');
    await shot(win, 'ui-notification-tasks.png');
    console.log('✅ notification shortcut');

    win.setSize(760, 760);
    await wait(500);
    if (!await win.webContents.executeJavaScript("document.body.innerText.includes('今日待办') && document.body.innerText.includes('开始使用')")) throw new Error('narrow dashboard lost actionable content');
    await shot(win, 'ui-dashboard-narrow.png');
    win.setSize(1280, 760);
    await wait(500);
    console.log('✅ narrow dashboard');

    if (!await clickByText(win, '发送失败')) throw new Error('failed dashboard card not found');
    await wait(1000);
    if (!await win.webContents.executeJavaScript("document.body.innerText.includes('当前仅显示：发送失败')")) throw new Error('failed dashboard card did not apply workbench filter');
    await shot(win, 'ui-workbench-failed-filter.png');
    console.log('✅ dashboard recovery filter');

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

    lastExportUrl = '';
    if (!await clickByText(win, '手动导出')) throw new Error('store export menu not found');
    await wait(300);
    if (!await clickByText(win, '全部内容 · CSV')) throw new Error('store full CSV export option not found');
    await wait(500);
    if (!lastExportUrl.includes('kind=store&format=csv') || /keyword=|shop=|stage=/.test(lastExportUrl)) throw new Error(`store full CSV export request invalid: ${lastExportUrl}`);
    console.log('✅ store full CSV export');

    await win.webContents.executeJavaScript("document.querySelector('[aria-label=删除]')?.click()");
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('确认删除')")) throw new Error('store delete confirmation not shown');
    if (!await clickByText(win, '取消')) throw new Error('store delete confirmation cancel not found');
    await wait(500);

    await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('input[type=checkbox]')).slice(0, 2).forEach(function(el) { el.click(); })");
    await wait(300);
    if (!await clickByText(win, '预览并合并')) throw new Error('store merge button not found');
    await wait(500);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('合并这两条知识')")) throw new Error('store merge confirmation not shown');
    await shot(win, 'ui-store-merge-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('store merge confirmation cancel not found');
    await wait(500);

    await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('*')).find(function(el) { return el.children.length === 0 && el.textContent === '产品支持几天无理由退换？'; })?.click()");
    await wait(300);
    if (!await clickByText(win, '查看版本历史')) throw new Error('store version history button not found');
    await wait(500);
    if (!await clickByText(win, '回滚')) throw new Error('store rollback button not found');
    await wait(300);
    if (!await win.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.innerText.includes('回滚到 v2')")) throw new Error('store rollback confirmation not shown');
    await shot(win, 'ui-store-rollback-confirm.png');
    if (!await clickByText(win, '取消')) throw new Error('store rollback confirmation cancel not found');
    await wait(500);

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
