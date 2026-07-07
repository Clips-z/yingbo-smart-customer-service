// 开发模式截图：加载 dev server 并捕获主窗口
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:1212/main.html';
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: MOCK_PRELOAD,
    },
  });

  await win.loadURL(TARGET_URL);

  // 等待渲染完成（含 HMR 编译）
  await new Promise((r) => setTimeout(r, 6000));

  const img = await win.capturePage();
  const outputPath = path.join(__dirname, 'ui-preview.png');
  require('fs').writeFileSync(outputPath, img.toPNG());
  console.log('Screenshot saved to:', outputPath);

  app.quit();
});
