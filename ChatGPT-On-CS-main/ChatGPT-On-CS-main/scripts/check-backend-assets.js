/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = process.argv.includes('--required');

const candidates = [
  path.join(root, 'assets', 'backend', '__main__.exe'),
  path.join(root, 'release', 'app', 'assets', 'backend', '__main__.exe'),
];

const existing = candidates.filter((file) => fs.existsSync(file));

if (existing.length > 0) {
  console.log('Backend executable found:');
  for (const file of existing) {
    const sizeMb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log(`  - ${path.relative(root, file)} (${sizeMb} MB)`);
  }
  process.exit(0);
}

const message = [
  'Backend executable is missing.',
  '',
  'Expected one of:',
  ...candidates.map((file) => `  - ${path.relative(root, file)}`),
  '',
  'The app can load its UI without this file, but platform automation and the',
  'Python-backed message collection/reply bridge will not start in packaged builds.',
  '',
  'Build or copy the PyInstaller backend output before packaging, or set BKEXE_PATH',
  'to a valid backend executable when launching locally.',
].join('\n');

if (required) {
  console.error(message);
  process.exit(1);
}

console.warn(message);
