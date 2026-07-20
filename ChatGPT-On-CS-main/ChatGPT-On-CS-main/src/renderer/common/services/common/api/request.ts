import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
  Method,
} from 'axios';

/**
 * 统一 API 响应结构
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/**
 * 请求配置
 */
export interface ConfigType {
  headers?: Record<string, string>;
  hold?: boolean;
  timeout?: number;
}

/**
 * API 错误类型 — 统一错误结构，方便调用方判断
 */
export interface ApiError {
  message: string;
  code?: number;
  status?: number;
  details?: unknown;
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000,
  headers: {
    'content-type': 'application/json',
    'Cache-Control': 'no-cache',
  },
});

/* 请求拦截 */
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => config,
  (err: unknown) => Promise.reject(err),
);

/* 响应拦截 */
instance.interceptors.response.use(
  (response: AxiosResponse) => response,
  (err: unknown) => Promise.reject(err),
);

/**
 * 响应数据检查 — 提取业务层错误码
 */
function checkRes<T>(data: T): T {
  const body = data as unknown as ApiResponse;
  if (data === undefined || data === null) {
    throw { message: '服务器异常' } as ApiError;
  }
  if (body.code && (body.code < 200 || body.code >= 400)) {
    throw {
      message: body.message || '请求失败',
      code: body.code,
      details: data,
    } as ApiError;
  }
  return data;
}

/**
 * 响应错误 — 将 AxiosError 转为 ApiError
 */
function responseError(err: AxiosError): Promise<never> {
  const apiError: ApiError = { message: '未知错误' };

  if (!err) {
    return Promise.reject(apiError);
  }

  if (err.message === 'Network Error') {
    apiError.message = '服务还在启动，请稍后尝试';
    return Promise.reject(apiError);
  }

  if (err.code === 'ECONNABORTED') {
    apiError.message = '请求超时，请稍后再试';
    return Promise.reject(apiError);
  }

  if (err.response) {
    apiError.status = err.response.status;
    const body = err.response.data;
    if (body && typeof body === 'object' && 'message' in body) {
      apiError.message = String(
        (body as { message: unknown }).message,
      );
      apiError.code = (body as { code?: number }).code;
      apiError.details = body;
    } else {
      apiError.message = `请求失败 (${err.response.status})`;
    }
    return Promise.reject(apiError);
  }

  apiError.message = err.message || String(err);
  return Promise.reject(apiError);
}

/**
 * 内部请求方法
 * T 是完整响应体类型（包含 code/message/data）
 */
function request<T = ApiResponse>(
  url: string,
  data: object,
  config: ConfigType,
  method: Method,
): Promise<T> {
  const payload = Array.isArray(data)
    ? data
    : Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => v !== null && v !== undefined,
        ),
      );

  return instance
    .request<T>({
      baseURL: `http://127.0.0.1:${window.electron.getPort()}`,
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? payload : null,
      params: !['POST', 'PUT'].includes(method) ? payload : null,
      ...config,
    })
    .then((res) => checkRes<T>(res.data))
    .catch((err: AxiosError) => responseError(err));
}

/**
 * GET 请求
 * @example const res = await GET<{ data: UserInfo[] }>('/api/users');
 *          // res.data 为 UserInfo[]
 */
export function GET<T = ApiResponse>(
  url: string,
  params: object = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, params, config, 'GET');
}

/**
 * POST 请求
 */
export function POST<T = ApiResponse>(
  url: string,
  data: object = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'POST');
}

/**
 * PUT 请求
 */
export function PUT<T = ApiResponse>(
  url: string,
  data: object = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'PUT');
}

/**
 * DELETE 请求
 */
export function DELETE<T = ApiResponse>(
  url: string,
  data: object = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'DELETE');
}

export default instance;
