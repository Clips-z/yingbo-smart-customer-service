import fs from 'fs';
import path from 'path';
import { CaptureShadowComparator } from '../src/main/backend/services/capture/shadowComparator';

function main(): void {
  const input = process.argv.find((arg) => arg.startsWith('--input='))?.slice(8);
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
  const comparator = new CaptureShadowComparator();
  if (input && fs.existsSync(input)) {
    for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as { source: 'structured' | 'ocr'; event: Parameters<CaptureShadowComparator['observe']>[1]; at?: number };
      comparator.observe(row.source, row.event, row.at);
    }
  }
  const report = { generatedAt: new Date().toISOString(), snapshot: comparator.snapshot() };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
