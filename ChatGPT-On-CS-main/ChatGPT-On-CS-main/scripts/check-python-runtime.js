/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const unpacked = process.argv.includes('--unpacked');
const root = unpacked
  ? path.join(appRoot, 'release', 'build', 'win-unpacked', 'resources')
  : appRoot;

const required = [
  'tools/python311/python.exe',
  'tools/python311/python311.dll',
  'tools/rapidocr-py311/rapidocr',
  'tools/wechat-py311/pyautogui',
  'tools/rag-py311/chromadb',
  'scripts/wechat-sidecar.py',
  'scripts/wecom-sidecar.py',
  'scripts/companion-target-window.ps1',
  'scripts/qianniu-window-bounds.ps1',
  'scripts/_retry_utils.py',
  'scripts/qianniu_rapidocr.py',
];
required.push(unpacked ? 'rag-server/server.py' : '../../rag-server/server.py');

const missing = required.filter(
  (item) => !fs.existsSync(path.join(root, item)),
);
if (missing.length) {
  console.error('Python runtime is incomplete:');
  missing.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}

const python = path.join(root, 'tools', 'python311', 'python.exe');
const imports = [
  ['rapidocr-py311', 'import rapidocr, onnxruntime'],
  [
    'wechat-py311',
    'import pyautogui, pywinauto, win32api, onnxruntime; from rapidocr_onnxruntime import RapidOCR',
  ],
  ['rag-py311', 'import chromadb, fastapi, onnxruntime'],
];
for (const [directory, statement] of imports) {
  const target = path.join(root, 'tools', directory);
  const code = `import site; site.addsitedir(r'${target}'); ${statement}`;
  const result = spawnSync(python, ['-X', 'utf8', '-c', code], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.error(`Import check failed for ${directory}:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

console.log(
  `Python runtime check passed (${unpacked ? 'packaged' : 'source'}).`,
);
