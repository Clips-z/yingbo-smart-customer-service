/* eslint-disable no-console */
/**
 * install-app-deps.js
 *
 * 将主进程运行时所需的原生模块（sqlite3 及其加载器 @mapbox/node-pre-gyp）
 * 安装到 release/app/node_modules，使打包后的 main.js（require('sqlite3')）
 * 能在 Electron 运行时正确解析。
 *
 * 背景：
 *   - ERB 模板默认通过 `electron-builder install-app-deps` + `electron-rebuild`
 *     在 release/app 里重编译原生模块。但在缺少 MSVC / node-gyp 构建链、
 *     或预编译二进制下载失败的环境下会失败（见 TEST-REPORT.md sqlite3 阻塞项）。
 *   - sqlite3@5.1.6 提供的 napi-v6 预编译二进制对 Electron 26（N-API v8）
 *     向后兼容，因此直接复用已下载的二进制即可，无需重新编译。
 *
 * 用法： node scripts/install-app-deps.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcNodeModules = path.join(root, 'node_modules');
const appNodeModules = path.join(root, 'release', 'app', 'node_modules');

// sqlite3 5.1.7 uses `bindings` at runtime. The older mapbox loader is no
// longer a dependency, so copy the actual pnpm-resolved dependency chain.
const REQUIRED_PACKAGES = ['sqlite3', 'bindings', 'file-uri-to-path'];

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

function ensureNapiBindings(sqlite3Dir) {
  // sqlite3 >= 5.1.7 loads the binary through `bindings` from build/Release.
  // electron-builder unpacks *.node files, so no N-API path shim is needed.
  if (fs.existsSync(path.join(sqlite3Dir, 'build', 'Release', 'node_sqlite3.node'))) {
    return;
  }
  // sqlite3 通过 node-pre-gyp 按 napi 版本查找二进制：
  //   lib/binding/napi-v{napi_build_version}-{platform}-{libc}-{arch}/node_sqlite3.node
  // Electron 26 使用 N-API v8，预编译包仅到 v6；v6 二进制对 v8 向后兼容，
  // 这里把 v6 复制一份到 v8 路径，保证 pre-gyp 能定位到文件。
  const v6 = path.join(sqlite3Dir, 'lib/binding/napi-v6-win32-unknown-x64');
  const v8 = path.join(sqlite3Dir, 'lib/binding/napi-v8-win32-unknown-x64');
  const v6Bin = path.join(v6, 'node_sqlite3.node');

  if (!fs.existsSync(v6Bin)) {
    throw new Error(`napi-v6 二进制缺失: ${v6Bin}（请先在项目根目录 npm install sqlite3）`);
  }
  fs.mkdirSync(v8, { recursive: true });
  const v8Bin = path.join(v8, 'node_sqlite3.node');
  if (!fs.existsSync(v8Bin) || fs.statSync(v8Bin).size === 0) {
    fs.copyFileSync(v6Bin, v8Bin);
    console.log(`  ✓ 生成 napi-v8 绑定: ${path.relative(root, v8Bin)}`);
  }
}

function main() {
  console.log('=== 安装 release/app 运行时原生依赖 ===');
  if (!fs.existsSync(srcNodeModules)) {
    throw new Error(`找不到源 node_modules: ${srcNodeModules}（请先在项目根目录 npm install）`);
  }
  fs.mkdirSync(appNodeModules, { recursive: true });

  const sqliteDir = fs.realpathSync(path.join(srcNodeModules, 'sqlite3'));
  const sqliteDeps = path.dirname(sqliteDir);
  const bindingsDir = fs.realpathSync(path.join(sqliteDeps, 'bindings'));
  const bindingsDeps = path.dirname(bindingsDir);
  const sources = {
    sqlite3: sqliteDir,
    bindings: bindingsDir,
    'file-uri-to-path': fs.realpathSync(
      path.join(bindingsDeps, 'file-uri-to-path'),
    ),
  };

  for (const pkg of REQUIRED_PACKAGES) {
    const src = sources[pkg];
    const dest = path.join(appNodeModules, pkg);
    if (!fs.existsSync(src)) {
      throw new Error(`源依赖缺失: ${src}`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyDirSync(src, dest);
    const sizeKB = Math.round(dirSize(dest) / 1024);
    console.log(`  ✓ ${pkg} → release/app/node_modules/${pkg} (${sizeKB} KB)`);
  }

  // 确保两个 napi 版本的绑定都在（兼容 Electron 的 N-API 版本解析）
  ensureNapiBindings(path.join(appNodeModules, 'sqlite3'));

  // 自检：尝试在 Node 下加载 sqlite3（确认 binding 路径与 node-pre-gyp 链路完整）
  try {
    const resolved = require.resolve('sqlite3', { paths: [appNodeModules] });
    const sqlite3 = require(resolved);
    if (typeof sqlite3.Database !== 'function') {
      throw new Error('sqlite3.Database 不是构造函数');
    }
    console.log(`  ✓ 自检通过：sqlite3 可正常加载 (${path.relative(root, resolved)})`);
  } catch (e) {
    throw new Error(`sqlite3 自检失败: ${e.message}`);
  }

  console.log('=== 完成 ===\n');
}

main();
