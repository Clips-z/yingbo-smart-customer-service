import { discoverCdpPorts, probeCdpEndpoint } from '../src/main/backend/services/cdp/cdpEndpointProbe';

function numberList(value: string): number[] {
  return value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0 && item < 65536);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const url = args.find((arg) => arg.startsWith('--url='))?.slice(6);
  const ports = args.find((arg) => arg.startsWith('--ports='))?.slice(8) || args.find((arg) => arg.startsWith('--port='))?.slice(7) || '9222,9229,9333,9515';
  const results = url ? [await probeCdpEndpoint(url)] : await discoverCdpPorts(numberList(ports));
  const successful = results.filter((result) => result.ok);
  console.log(JSON.stringify({ ok: successful.length > 0, results }, null, 2));
  process.exitCode = successful.length > 0 ? 0 : 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
