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

// The request spy must exist before axios.create runs during module import.
// eslint-disable-next-line import/first
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

  it('preserves business error details', async () => {
    const body = { code: 422, message: 'invalid request', data: { field: 'name' } };
    mockRequest.mockResolvedValueOnce({ data: body });

    await expect(POST('/config')).rejects.toMatchObject({
      message: body.message,
      code: body.code,
      details: body,
    });
  });

  it('turns structured transport errors into readable Error instances', async () => {
    mockRequest.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: { reason: '当前客户输入框不可用' }, code: 40901 },
      },
    });

    await expect(POST('/fill')).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: '当前客户输入框不可用',
      status: 409,
      code: 40901,
    });
  });

  it('keeps nested business errors readable', async () => {
    mockRequest.mockResolvedValueOnce({
      data: { code: 409, message: { error: '会话已经切换' } },
    });

    await expect(POST('/fill')).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: '会话已经切换',
      code: 409,
    });
  });
});
