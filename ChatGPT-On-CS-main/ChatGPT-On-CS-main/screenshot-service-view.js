// 截图客服中心视图：完整版 - 用本地 HTTP server 提供 mock API
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');

app.commandLine.appendSwitch('no-sandbox');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:1212/main.html';
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');
const MOCK_PORT = 33847;

const now = new Date();
const MOCK_RESPONSES = {
  '/api/v1/base/platform/all': { code: 0, message: 'ok', data: [
    { id: 'win_qianniu', name: '千牛客服', platform_id: 'win_qianniu', status: 'running', running: true, instances: [{ id: 'inst_1', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wechat', name: '微信客服', platform_id: 'win_wechat', status: 'running', running: true, instances: [{ id: 'inst_2', name: '默认实例', status: 'running', running: true }] },
    { id: 'win_wecom', name: '企业微信客服', platform_id: 'win_wecom', status: 'running', running: true, instances: [{ id: 'inst_3', name: '默认实例', status: 'running', running: true }] },
  ]},
  '/api/v1/compat/qianniu/suggestions': { code: 0, message: 'ok', data: [
    { id: 101, sender: '买家小明', incoming_content: '这个衣服是什么材质的？会缩水吗？', reply_content: '亲，这款衣服是95%棉+5%氨纶，已经做过预缩处理，正常洗涤不会缩水哦~', status: 'pending', platform_id: 'win_qianniu', created_at: new Date(now - 120000).toISOString() },
    { id: 102, sender: '张女士', incoming_content: '我买了两件只收到一件，麻烦帮我查一下物流', reply_content: '非常抱歉给您带来不便！我马上帮您查一下物流信息，请稍等片刻~', status: 'pending', platform_id: 'win_wechat', created_at: new Date(now - 300000).toISOString() },
    { id: 103, sender: '老客户王哥', incoming_content: '上次买的茶叶不错，这次想再买两盒送人，有礼盒装吗？', reply_content: '王哥好！有的，我们新出了精装礼盒款，两盒装送礼很大气，今天下单还送手提袋哦~', status: 'prepared', platform_id: 'win_qianniu', created_at: new Date(now - 600000).toISOString() },
    { id: 104, sender: '新用户李四', incoming_content: '你好，我想了解一下退换货政策', reply_content: '您好！我们支持7天无理由退换，只要不影响二次销售即可。具体流程：申请售后→填写原因→寄回→我们收到后24小时内处理退款~', status: 'pending', platform_id: 'win_wecom', created_at: new Date(now - 900000).toISOString() },
    { id: 105, sender: 'VIP客户陈总', incoming_content: '上次你说帮我留的那批货到了吗？', reply_content: '陈总您好！货已经到了，我这边帮您优先安排发货，预计明天就能发出~', status: 'sent', platform_id: 'win_wechat', created_at: new Date(now - 1800000).toISOString() },
    { id: 106, sender: '赵小姐', incoming_content: '这个价格还能优惠吗？我看别家便宜20块', reply_content: '赵小姐，我们家品质是有保障的哦~虽然价格稍高一点，但用料和做工都是最好的。这样吧，我帮您申请一个老客户折扣，可以优惠10元，您看可以吗？', status: 'failed', platform_id: 'win_qianniu', created_at: new Date(now - 3600000).toISOString() },
  ]},
};

// 启动本地 HTTP mock 服务器
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const url = req.url;
  let mockData = null;
  
  if (url.includes('/api/v1/base/platform/all')) mockData = MOCK_RESPONSES['/api/v1/base/platform/all'];
  else if (url.includes('suggestions')) mockData = MOCK_RESPONSES['/api/v1/compat/qianniu/suggestions'];
  else if (url.includes('reply-mode')) mockData = { code: 0, message: 'ok', data: { mode: 'hint' } };
  else if (url.includes('health') || url.includes('collector')) mockData = { code: 0, message: 'ok', data: { state: 'running', lastError: null } };
  else if (url.includes('/api/v1/')) mockData = { code: 0, message: 'ok', data: null };
  
  if (mockData) {
    console.log('[mock-http]', url);
    res.end(JSON.stringify(mockData));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ code: 404, message: 'not found' }));
  }
});

server.listen(MOCK_PORT, '127.0.0.1', () => {
  console.log('[mock-http] Server running on port', MOCK_PORT);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 528, height: 1024, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: MOCK_PRELOAD },
  });

  await win.loadURL(TARGET_URL);
  await new Promise((r) => setTimeout(r, 6000));

  // 点击「客服中心」
  await win.webContents.executeJavaScript(`
    (function() {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.children.length === 0 && el.textContent && el.textContent.trim() === '客服中心') {
          el.click();
          return;
        }
      }
    })()
  `);

  await new Promise((r) => setTimeout(r, 2000));

  // 设置 store（对抗 AppManagerContext 覆盖）
  for (let i = 0; i < 5; i++) {
    await win.webContents.executeJavaScript(`
      if (window.__globalStore) {
        window.__globalStore.setState({
          activePlatformId: 'all',
          activePlatformIds: ['win_qianniu', 'win_wechat', 'win_wecom'],
        });
      }
    `);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 检查 DOM
  const debug = await win.webContents.executeJavaScript(`
    (function() {
      const bodyText = document.body.innerText.substring(0, 1200);
      const store = window.__globalStore;
      return JSON.stringify({
        storeActivePlatformId: store?.getState().activePlatformId,
        storeActivePlatformIds: store?.getState().activePlatformIds,
        hasPlatformTab: bodyText.includes('千牛'),
        hasSender: bodyText.includes('买家小明'),
        bodyPreview: bodyText,
      });
    })()
  `);
  console.log('DEBUG:', debug);

  const img = await win.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'ui-preview.png'), img.toPNG());
  console.log('截图完成');
  
  server.close();
  app.quit();
});
