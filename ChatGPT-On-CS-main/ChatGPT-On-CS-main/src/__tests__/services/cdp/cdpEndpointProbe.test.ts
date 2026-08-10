import http from 'http';
import { probeCdpEndpoint } from '../../../main/backend/services/cdp/cdpEndpointProbe';

describe('probeCdpEndpoint', () => {
  test('reads version and page targets from a CDP endpoint', async () => {
    const server = http.createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/json/version') {
        response.end(JSON.stringify({ Browser: 'Test/1', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser' }));
        return;
      }
      response.end(JSON.stringify([{ id: 'page-1', type: 'page', title: '千牛', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page-1' }]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    const result = await probeCdpEndpoint(`http://127.0.0.1:${address.port}`);
    server.close();

    expect(result.ok).toBe(true);
    expect(result.endpoint?.targets[0].title).toBe('千牛');
  });

  test('returns a diagnostic when the port is unavailable', async () => {
    const result = await probeCdpEndpoint('http://127.0.0.1:1', 50);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
