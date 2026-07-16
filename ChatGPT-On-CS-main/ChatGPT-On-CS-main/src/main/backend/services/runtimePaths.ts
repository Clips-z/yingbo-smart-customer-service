import fs from 'fs';
import path from 'path';

function hasRuntimeAssets(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, 'scripts'));
}

/**
 * Resolve runtime assets independently of the process working directory.
 * Development runs from the project root; packaged Windows builds run beside
 * the application executable.
 */
export function getRuntimeRoot(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath;
  const candidates = [
    resourcesPath,
    path.dirname(process.execPath),
    process.cwd(),
    resourcesPath ? path.dirname(resourcesPath) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find(hasRuntimeAssets) || process.cwd();
}

export function runtimePath(...parts: string[]): string {
  return path.join(getRuntimeRoot(), ...parts);
}

export function rapidOcrPythonPath(): string {
  const root = getRuntimeRoot();
  const candidates = [
    path.join(root, 'tools', 'python311', 'python.exe'),
    path.join(root, '.venv-wechat', 'Scripts', 'python.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}
