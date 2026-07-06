const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const python = path.join(root, '.venv-wechat', 'Scripts', 'python.exe');
const script = path.join(root, 'scripts', 'wechat-sidecar.py');
const logDir = path.join(root, '.tmp-userdata', 'logs');
const logFile = path.join(logDir, 'wechat-sidecar-launch.log');

if (!fs.existsSync(python)) {
  throw new Error(`Wechat sidecar virtual environment not found: ${python}`);
}

fs.mkdirSync(logDir, { recursive: true });
const output = fs.openSync(logFile, 'a');
const child = spawn(python, [script, ...process.argv.slice(2)], {
  cwd: root,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', output, output],
});

child.unref();
console.log(`Started WeChat sidecar with PID ${child.pid}`);
console.log(`Sidecar log: ${logFile}`);
