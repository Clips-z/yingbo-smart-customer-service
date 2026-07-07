// 长驻 Electron 截图守护：保持窗口打开，定时 capturePage 写 ui-preview.png
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:1212/main.html';
const MOCK_PRELOAD = path.join(__dirname, 'mock-preload.js');
const OUTPUT = path.join(__dirname, 'ui-preview.png');
const INTERVAL = parseInt(process.env.SHOT_INTERVAL || '4000', 10); // 截图间隔 ms

let win;

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: MOCK_PRELOAD,
    },
  });

  await win.loadURL(TARGET_URL);
  console.log('[live-electron] 窗口加载完成，开始定时截图，间隔', INTERVAL, 'ms');

  // 首帧等待
  await new Promise((r) => setTimeout(r, 4000));

  setInterval(async () => {
    try {
      const img = await win.capturePage();
      // 先写临时文件再 rename，避免 HTTP 读到半截
      const tmp = OUTPUT + '.tmp';
      fs.writeFileSync(tmp, img.toPNG());
      fs.renameSync(tmp, OUTPUT);
    } catch (e) {
      // 窗口可能正在重载，忽略
    }
  }, INTERVAL);
});

app.on('window-all-closed', () => {
  // 保持运行
});
