// 按真实窗口尺寸(528x1024)截图，反映用户实际看到的窄窗口布局
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:1212/main.html';
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 528,
    height: 1024,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: MOCK_PRELOAD,
    },
  });

  await win.loadURL(TARGET_URL);

  // 等待 HMR 编译 + 渲染完成
  await new Promise((r) => setTimeout(r, 7000));

  const img = await win.capturePage();
  const outputPath = path.join(__dirname, 'ui-preview.png');
  require('fs').writeFileSync(outputPath, img.toPNG());
  console.log('Screenshot (528x1024) saved to:', outputPath);

  app.quit();
});
