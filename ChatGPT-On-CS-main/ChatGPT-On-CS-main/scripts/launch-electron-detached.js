const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const logDir = path.join(root, '.tmp-userdata', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const electronCmd = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);

const logFile = path.join(logDir, 'electron-startup.log');
const out = fs.openSync(logFile, 'a');

const env = {
  ...process.env,
  ALLOW_MULTI_INSTANCE: '1',
  ELECTRON_USER_DATA_DIR: path.join(root, '.tmp-userdata'),
  DB_DIR: path.join(root, '.tmp-userdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const child = spawn(electronCmd, [path.join(root, 'release', 'app')], {
  cwd: root,
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: false,
  env,
});

child.unref();
console.log(`Started Yingbo Intelligent Customer Service with PID ${child.pid}`);
console.log(`Startup log: ${logFile}`);
