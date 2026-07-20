import { GET } from '../../renderer/common/services/common/api/request';
import { fetchEvaluationCases } from '../../renderer/common/services/knowledge/corpusTest';

jest.mock('../../renderer/common/services/common/api/request', () => ({
  GET: jest.fn(),
  POST: jest.fn(),
}));

describe('corpus test service', () => {
  beforeEach(() => jest.resetAllMocks());

  it('treats an empty evaluation response as an empty list', async () => {
    jest.mocked(GET).mockResolvedValueOnce({ data: null } as never);

    await expect(fetchEvaluationCases()).resolves.toEqual([]);
  });
});
