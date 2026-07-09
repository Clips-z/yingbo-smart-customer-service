/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const releaseAppDir = path.join(root, 'release', 'app');
const releasePackagePath = path.join(releaseAppDir, 'package.json');
const rootPackage = require(path.join(root, 'package.json'));

const releasePackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  main: './dist/main/main.js',
  author: rootPackage.author,
  license: rootPackage.license,
  dependencies: {
    sqlite3:
      rootPackage.dependencies?.sqlite3 ||
      rootPackage.devDependencies?.sqlite3 ||
      '^5.1.6',
  },
};

fs.mkdirSync(releaseAppDir, { recursive: true });

fs.writeFileSync(
  releasePackagePath,
  `${JSON.stringify(releasePackage, null, 2)}\n`,
);
console.log('Updated release/app/package.json');
