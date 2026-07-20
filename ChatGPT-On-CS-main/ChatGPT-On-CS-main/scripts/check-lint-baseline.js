/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const baseline = { errors: 433, warnings: 8 };
const result = spawnSync(
  process.execPath,
  [
    path.join(appRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    'src',
    '--ext',
    '.js,.jsx,.ts,.tsx',
    '--rule',
    'prettier/prettier: off',
    '--format',
    'json',
  ],
  {
    cwd: appRoot,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      TS_NODE_TRANSPILE_ONLY: 'true',
      TS_NODE_PROJECT: 'tsconfig.cjs.json',
    },
  },
);

let files;
try {
  files = JSON.parse(result.stdout);
} catch {
  console.error(result.stderr || result.stdout || result.error);
  process.exit(result.status || 1);
}

const messages = files.flatMap((file) => file.messages);
const current = {
  errors: messages.filter((message) => message.severity === 2).length,
  warnings: messages.filter((message) => message.severity === 1).length,
};

if (
  current.errors !== baseline.errors ||
  current.warnings !== baseline.warnings
) {
  console.error(
    `ESLint debt changed: expected ${baseline.errors} errors/${baseline.warnings} warnings, found ${current.errors} errors/${current.warnings} warnings.`,
  );
  console.error(
    current.errors <= baseline.errors && current.warnings <= baseline.warnings
      ? 'Lower the baseline in scripts/check-lint-baseline.js to keep the improvement.'
      : 'Run pnpm lint:raw to inspect the new findings.',
  );
  process.exit(1);
}

console.log(
  `ESLint debt baseline passed (${baseline.errors} errors, ${baseline.warnings} warnings).`,
);
