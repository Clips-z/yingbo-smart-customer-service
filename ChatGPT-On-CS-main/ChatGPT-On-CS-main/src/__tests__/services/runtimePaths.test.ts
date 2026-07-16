import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getRuntimeRoot,
  rapidOcrPythonPath,
  runtimePath,
} from '../../main/backend/services/runtimePaths';

describe('runtimePaths', () => {
  it('resolves the development runtime root from project assets', () => {
    expect(fs.existsSync(path.join(getRuntimeRoot(), 'scripts'))).toBe(true);
    expect(fs.existsSync(runtimePath('scripts', 'wechat-sidecar.py'))).toBe(
      true,
    );
  });

  it('prefers packaged resources over a working directory that also has scripts', () => {
    const originalResourcesPath = (process as NodeJS.Process & {
      resourcesPath?: string;
    }).resourcesPath;
    const originalCwd = process.cwd;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-paths-'));
    const packagedResources = path.join(tempRoot, 'resources');
    const workingDirectory = path.join(tempRoot, 'workspace');
    fs.mkdirSync(path.join(packagedResources, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(workingDirectory, 'scripts'), { recursive: true });

    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: packagedResources,
    });
    process.cwd = jest.fn(() => workingDirectory);

    try {
      expect(getRuntimeRoot()).toBe(packagedResources);
    } finally {
      process.cwd = originalCwd;
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath,
      });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to the bundled wechat Python when dedicated OCR Python is absent', () => {
    const originalResourcesPath = (process as NodeJS.Process & {
      resourcesPath?: string;
    }).resourcesPath;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-python-'));
    const packagedResources = path.join(tempRoot, 'resources');
    const fallback = path.join(
      packagedResources,
      '.venv-wechat',
      'Scripts',
      'python.exe',
    );
    fs.mkdirSync(path.join(packagedResources, 'scripts'), { recursive: true });
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, 'test');
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: packagedResources,
    });

    try {
      expect(rapidOcrPythonPath()).toBe(fallback);
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath,
      });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
