process.env.NODE_ENV = 'production';
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = 'tsconfig.cjs.json';

const { execSync } = require('child_process');
const webpack = require.resolve('webpack-cli/bin/cli.js');

try {
  execSync(`node "${webpack}" --config ./.erb/configs/webpack.config.main.prod.ts`, {
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env,
  });
} catch (e) {
  process.exit(1);
}
