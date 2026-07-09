/* eslint-disable no-console */
/**
 * Copy runtime native dependencies into release/app.
 *
 * electron-builder packages release/app as the real application root. Native
 * modules required by the main process must therefore exist under
 * release/app/node_modules, including their own dependency chain.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appNodeModules = path.join(root, 'release', 'app', 'node_modules');
const copied = new Set();

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function dirSize(p) {
  let total = 0;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function packageDest(packageName) {
  return path.join(appNodeModules, ...packageName.split('/'));
}

function packageRootFromJson(packageJsonPath) {
  return path.dirname(packageJsonPath);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function copyPackage(packageName, resolveFrom) {
  if (copied.has(packageName)) return packageDest(packageName);

  const packageJsonPath = require.resolve(`${packageName}/package.json`, {
    paths: [resolveFrom, root],
  });
  const src = packageRootFromJson(packageJsonPath);
  const dest = packageDest(packageName);
  const pkg = readJson(packageJsonPath);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copyDirSync(src, dest);
  copied.add(packageName);

  const sizeKB = Math.round(dirSize(dest) / 1024);
  console.log(`  OK ${packageName} -> release/app/node_modules/${packageName} (${sizeKB} KB)`);

  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
  for (const depName of Object.keys(dependencies)) {
    copyPackage(depName, src);
  }

  return dest;
}

function findBundledSqliteBinary() {
  const candidates = [
    path.join(root, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node'),
    path.join(root, 'node_modules', 'sqlite3', 'lib', 'binding', 'napi-v8-win32-unknown-x64', 'node_sqlite3.node'),
    path.join(root, 'node_modules', 'sqlite3', 'lib', 'binding', 'napi-v6-win32-unknown-x64', 'node_sqlite3.node'),
    path.resolve(root, '..', '..', '..', 'ChatGPT-On-CS-main', 'ChatGPT-On-CS-main', 'node_modules', 'sqlite3', 'lib', 'binding', 'napi-v8-win32-unknown-x64', 'node_sqlite3.node'),
    path.resolve(root, '..', '..', '..', 'ChatGPT-On-CS-main', 'ChatGPT-On-CS-main', 'node_modules', 'sqlite3', 'lib', 'binding', 'napi-v6-win32-unknown-x64', 'node_sqlite3.node'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function ensureSqliteBinary(sqlite3Dir) {
  const buildRelease = path.join(sqlite3Dir, 'build', 'Release');
  const buildReleaseBin = path.join(buildRelease, 'node_sqlite3.node');
  if (fs.existsSync(buildReleaseBin) && fs.statSync(buildReleaseBin).size > 0) {
    return;
  }

  const bundledBinary = findBundledSqliteBinary();
  if (!bundledBinary) {
    throw new Error('sqlite3 binary is missing. Run pnpm rebuild sqlite3 or provide node_sqlite3.node.');
  }

  fs.mkdirSync(buildRelease, { recursive: true });
  fs.copyFileSync(bundledBinary, buildReleaseBin);
  console.log(`  OK sqlite3 binary -> ${path.relative(root, buildReleaseBin)}`);
}

function selfTest() {
  const resolved = require.resolve('sqlite3', { paths: [appNodeModules] });
  const sqlite3 = require(resolved);
  if (typeof sqlite3.Database !== 'function') {
    throw new Error('sqlite3.Database is not available.');
  }
  console.log(`  OK sqlite3 self-test passed (${path.relative(root, resolved)})`);
}

function main() {
  console.log('=== Installing release/app runtime native dependencies ===');
  fs.mkdirSync(appNodeModules, { recursive: true });

  const sqlite3Dir = copyPackage('sqlite3', root);
  ensureSqliteBinary(sqlite3Dir);
  selfTest();

  console.log('=== Done ===\n');
}

main();
