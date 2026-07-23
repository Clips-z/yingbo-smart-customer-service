import { RagService } from '../../main/backend/services/ragService';

describe('RAG recovery', () => {
  it('continues a restored knowledge rebuild only after RAG is running', async () => {
    const service = new RagService({} as any, {} as any);
    setTimeout(() => { (service as any).state = 'running'; }, 10);
    await expect(service.waitUntilRunning(1_000)).resolves.toBeUndefined();
  });
});
