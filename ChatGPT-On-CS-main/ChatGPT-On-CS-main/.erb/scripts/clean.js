require('ts-node/register/transpile-only');

const { rimrafSync } = require('rimraf');
const fs = require('fs');
const webpackPaths = require('../configs/webpack.paths').default;

const foldersToRemove = [
  webpackPaths.distPath,
  webpackPaths.buildPath,
  webpackPaths.dllPath,
];

foldersToRemove.forEach((folder) => {
  if (fs.existsSync(folder)) rimrafSync(folder);
});
