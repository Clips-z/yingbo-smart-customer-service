import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { CaptureMetrics } from '../src/main/backend/services/cdp/captureMetrics';

function arg(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function main(): void {
  const output = resolve(arg('--output') || 'docs/architecture/realtime-capture-baseline.jsonl');
  const metrics = new CaptureMetrics();
  const snapshot = metrics.snapshot();
  const record = {
    generatedAt: new Date().toISOString(),
    note: 'Empty baseline container. Runtime metrics are appended by the application without message text.',
    snapshot,
  };
  mkdirSync(dirname(output), { recursive: true });
  if (!existsSync(output)) writeFileSync(output, '', 'utf8');
  appendFileSync(output, `${JSON.stringify(record)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

main();
