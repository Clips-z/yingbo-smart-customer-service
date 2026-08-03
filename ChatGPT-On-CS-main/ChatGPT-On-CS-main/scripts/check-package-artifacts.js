/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'release', 'build');
const unpacked = path.join(build, 'win-unpacked');
const packageJson = require(path.join(root, 'package.json'));
// electron-builder uses the configured artifactName for release builds. Keep
// the historical Chinese filename as a fallback so older local packages are
// still verifiable.
const installerCandidates = [
  path.join(build, `yingbo-smart-customer-service_v${packageJson.version}_windows_x64_setup.exe`),
  path.join(build, `迎波智能客服 ${packageJson.version}.exe`),
];
const installer = installerCandidates.find(
  (file) => fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0,
) || installerCandidates[0];
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

const runRuntimeCheck = (scriptPath, cwd) => spawnSync(
  process.execPath,
  [scriptPath, '--unpacked'],
  { cwd, encoding: 'utf8' },
);

let check = runRuntimeCheck(path.join(__dirname, 'check-python-runtime.js'), root);
// Windows can reject native Python DLL imports when the checkout path is very
// deep. Re-run through a temporary SUBST drive so the verifier reflects the
// path an installed application will normally have.
if (
  check.status !== 0 &&
  process.platform === 'win32' &&
  !fs.existsSync('Y:\\')
) {
  const mappedRoot = 'Y:';
  const mapped = spawnSync('subst', [mappedRoot, root], { encoding: 'utf8' });
  if (mapped.status === 0) {
    try {
      const relativeScript = path.relative(root, path.join(__dirname, 'check-python-runtime.js'));
      check = runRuntimeCheck(path.join(`${mappedRoot}\\`, relativeScript), `${mappedRoot}\\`);
    } finally {
      spawnSync('subst', [mappedRoot, '/d'], { stdio: 'ignore' });
    }
  }
}
if (check.status !== 0) {
  if (check.stdout) process.stdout.write(check.stdout);
  if (check.stderr) process.stderr.write(check.stderr);
  process.exit(check.status || 1);
}
if (check.stdout) process.stdout.write(check.stdout);
console.log(`v${packageJson.version} package artifacts are complete.`);
