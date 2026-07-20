const mockRequest = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      request: mockRequest,
    }),
  },
}));

import { POST } from '../../renderer/common/services/common/api/request';

describe('API request payload normalization', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ data: { success: true } });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { getPort: () => 9999 },
    });
  });

  it('preserves array request bodies', async () => {
    await POST('/platforms', ['win_qianniu', 'win_wechat']);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: ['win_qianniu', 'win_wechat'],
      }),
    );
  });

  it('removes only nullish object fields', async () => {
    await POST('/config', {
      empty: null,
      missing: undefined,
      enabled: false,
      retries: 0,
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { enabled: false, retries: 0 },
      }),
    );
  });
});
