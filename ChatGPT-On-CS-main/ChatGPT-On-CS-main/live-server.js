// 实时预览 HTTP 服务：serve 预览页 + 最新截图
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PREVIEW_PORT || '8080', 10);
const SHOT_INTERVAL = parseInt(process.env.SHOT_INTERVAL || '4000', 10);

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>迎波智能客服 · 实时预览</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#1a202c; font-family: system-ui, -apple-system, sans-serif; color:#e2e8f0; }
  .bar { position:sticky; top:0; background:#2d3748; padding:10px 20px; display:flex; align-items:center; gap:16px; box-shadow:0 2px 8px rgba(0,0,0,.4); z-index:10; }
  .bar b { color:#63b3ed; font-size:15px; }
  .dot { width:9px; height:9px; border-radius:50%; background:#48bb78; box-shadow:0 0 8px #48bb78; animation:pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  .meta { font-size:12px; color:#a0aec0; }
  .wrap { padding:16px; }
  img { display:block; width:100%; max-width:1280px; margin:0 auto; border-radius:8px; box-shadow:0 4px 24px rgba(0,0,0,.5); background:#fff; }
  .hint { text-align:center; color:#718096; font-size:12px; margin-top:10px; }
</style>
</head>
<body>
  <div class="bar">
    <span class="dot"></span>
    <b>迎波智能客服 · 实时预览</b>
    <span class="meta">完整应用运行中 · 后端 SQLite 已初始化 · 每 ${SHOT_INTERVAL / 1000}s 自动刷新</span>
  </div>
  <div class="wrap">
    <img id="shot" src="/ui-preview.png?t=${Date.now()}" alt="UI Preview">
    <div class="hint">修改 src/renderer/ 下代码后，此页面会自动刷新显示最新画面</div>
  </div>
  <script>
    const img = document.getElementById('shot');
    setInterval(() => {
      img.src = '/ui-preview.png?t=' + Date.now();
    }, ${SHOT_INTERVAL});
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.url.startsWith('/ui-preview.png')) {
    const file = path.join(ROOT, 'ui-preview.png');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('screenshot not ready');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[live-server] 预览服务已启动: http://localhost:' + PORT + '/');
});
