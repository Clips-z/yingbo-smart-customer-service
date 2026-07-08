/* eslint-disable no-console */
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const previewDir = path.join(root, 'web-preview');
const port = Number(process.env.PREVIEW_PORT || 4173);
const clients = new Set();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tsx': 'text/plain; charset=utf-8',
};

function sendReload() {
  for (const res of clients) {
    res.write('event: reload\ndata: now\n\n');
  }
}

function injectLiveReload(html) {
  const snippet = `
<script>
(() => {
  const events = new EventSource('/__preview/events');
  events.addEventListener('reload', () => window.location.reload());
})();
</script>`;
  return html.includes('</body>')
    ? html.replace('</body>', `${snippet}</body>`)
    : `${html}${snippet}`;
}

function safeResolve(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const filePath = path.resolve(
    previewDir,
    cleanPath === '' ? 'preview.html' : cleanPath,
  );
  if (!filePath.startsWith(previewDir)) {
    return null;
  }
  return filePath;
}

const server = http.createServer((req, res) => {
  if (req.url === '/__preview/events') {
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const filePath = safeResolve(req.url || '/');
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  if (ext === '.html') {
    const html = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(injectLiveReload(html));
    return;
  }

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

let debounceTimer;
fs.watch(previewDir, { recursive: true }, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sendReload, 150);
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.log(`Preview already running at http://127.0.0.1:${port}`);
    process.exit(0);
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview running at http://127.0.0.1:${port}`);
});
