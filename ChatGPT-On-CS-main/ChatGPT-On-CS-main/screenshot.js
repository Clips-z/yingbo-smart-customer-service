// 截图脚本：启动应用并捕获主窗口截图
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // 加载打包后的 renderer
  const rendererPath = path.join(__dirname, 'release/app/dist/renderer/main.html');
  await win.loadFile(rendererPath);

  // 等待渲染完成
  await new Promise((r) => setTimeout(r, 3000));

  const img = await win.capturePage();
  const outputPath = path.join(__dirname, 'ui-screenshot.png');
  require('fs').writeFileSync(outputPath, img.toPNG());
  console.log('Screenshot saved to:', outputPath);

  app.quit();
});
