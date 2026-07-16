/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'release', 'build');
const unpacked = path.join(build, 'win-unpacked');
const packageJson = require(path.join(root, 'package.json'));
const installer = path.join(build, `迎波智能客服 ${packageJson.version}.exe`);
const files = [
  installer,
  path.join(unpacked, '迎波智能客服.exe'),
  path.join(unpacked, 'resources', 'app.asar'),
  path.join(unpacked, 'resources', 'tools', 'python311', 'python.exe'),
];

const invalid = files.filter(
  (file) =>
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile() ||
    fs.statSync(file).size === 0,
);
if (invalid.length) {
  invalid.forEach((file) =>
    console.error(`Missing or empty artifact: ${path.relative(root, file)}`),
  );
  process.exit(1);
}

const check = spawnSync(
  process.execPath,
  [path.join(__dirname, 'check-python-runtime.js'), '--unpacked'],
  {
    stdio: 'inherit',
  },
);
if (check.status !== 0) process.exit(check.status || 1);
console.log(`v${packageJson.version} package artifacts are complete.`);
