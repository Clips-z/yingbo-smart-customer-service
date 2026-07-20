/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const baseline = 48;
const result = spawnSync(
  process.execPath,
  [
    path.join(appRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    path.join(appRoot, 'tsconfig.typecheck.json'),
    '--pretty',
    'false',
  ],
  { cwd: appRoot, encoding: 'utf8', windowsHide: true },
);

if (result.error || ![0, 2].includes(result.status)) {
  console.error(result.error || result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const output = `${result.stdout || ''}\n${result.stderr || ''}`;
const count = (output.match(/error TS\d+:/g) || []).length;

if (count !== baseline) {
  const direction = count > baseline ? 'increased' : 'decreased';
  console.error(
    `TypeScript debt ${direction}: expected ${baseline} errors, found ${count}.`,
  );
  console.error(
    count > baseline
      ? output
      : 'Lower the baseline in scripts/check-type-baseline.js to keep the improvement.',
  );
  process.exit(1);
}

console.log(`TypeScript debt baseline passed (${baseline} existing errors).`);
