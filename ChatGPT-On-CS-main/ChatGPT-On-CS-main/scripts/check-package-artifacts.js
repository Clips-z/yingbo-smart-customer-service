/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'release', 'build');
const unpackedDir = path.join(buildDir, 'win-unpacked');

const requiredFiles = [
  {
    label: 'NSIS installer',
    path: path.join(buildDir, '迎波智能客服 1.4.5.exe'),
  },
  {
    label: 'portable app executable',
    path: path.join(unpackedDir, '迎波智能客服.exe'),
  },
  {
    label: 'Python backend executable',
    path: path.join(unpackedDir, 'resources', 'assets', 'backend', '__main__.exe'),
  },
  {
    label: 'sqlite3 native binding',
    path: path.join(
      unpackedDir,
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'sqlite3',
      'build',
      'Release',
      'node_sqlite3.node',
    ),
  },
  {
    label: 'application archive',
    path: path.join(unpackedDir, 'resources', 'app.asar'),
  },
];

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function checkFile(item) {
  if (!fs.existsSync(item.path)) {
    return { ...item, ok: false, reason: 'missing' };
  }

  const stat = fs.statSync(item.path);
  if (!stat.isFile() || stat.size <= 0) {
    return { ...item, ok: false, reason: 'empty or not a file' };
  }

  return { ...item, ok: true, size: stat.size };
}

function main() {
  console.log('=== Checking packaged release artifacts ===');
  const results = requiredFiles.map(checkFile);

  for (const result of results) {
    const relative = path.relative(root, result.path);
    if (result.ok) {
      console.log(`  OK ${result.label}: ${relative} (${formatSize(result.size)})`);
    } else {
      console.error(`  FAIL ${result.label}: ${relative} (${result.reason})`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`=== Failed: ${failed.length} artifact(s) missing or invalid ===`);
    process.exit(1);
  }

  console.log('=== Package artifacts look complete ===');
}

main();
