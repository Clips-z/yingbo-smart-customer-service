/**
 * 统一 API 请求层 — 懒人客服
 *
 * 特性：
 * - 自动端口探测（window.electron.getPort()）
 * - 统一错误结构（ApiError）
 * - 超时 + 重试 + 请求去重
 * - 业务错误码检查
 */

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
  /** 失败重试次数，默认 0 */
  retry?: number;
  /** 重试延迟（ms），默认 1000 */
  retryDelay?: number;
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

/** 默认超时时间 */
const DEFAULT_TIMEOUT = 60000;

/** 请求去重 Map（key: method+url+JSON(params) → pending Promise） */
const pendingRequests = new Map<string, Promise<unknown>>();

/* 创建请求实例 */
const instance = axios.create({
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'content-type': 'application/json',
    'Cache-Control': 'no-cache',
  },
});

/* 请求拦截 */
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 添加请求时间戳用于调试
    (config as Record<string, unknown>)._startTime = Date.now();
    return config;
  },
  (err: unknown) => Promise.reject(err),
);

/* 响应拦截 */
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    // 开发环境下记录请求耗时
    if (process.env.NODE_ENV === 'development') {
      const startTime = (response.config as Record<string, unknown>)._startTime as number;
      if (startTime) {
        const duration = Date.now() - startTime;
        if (duration > 2000) {
          console.warn(`[API] 慢请求 ${response.config.method?.toUpperCase()} ${response.config.url} — ${duration}ms`);
        }
      }
    }
    return response;
  },
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
 * 生成请求去重 key
 */
function dedupeKey(url: string, data: Record<string, unknown>, method: Method): string {
  return `${method}:${url}:${JSON.stringify(data)}`;
}

/**
 * 内部请求方法（带重试与去重）
 * T 是完整响应体类型（包含 code/message/data）
 */
async function request<T = ApiResponse>(
  url: string,
  data: Record<string, unknown>,
  config: ConfigType,
  method: Method,
): Promise<T> {
  const { retry = 0, retryDelay = 1000, hold, ...restConfig } = config;

  const payload = Object.fromEntries(
    Object.entries(data).filter(
      ([, v]) => v !== null && v !== undefined,
    ),
  );

  // 请求去重：GET 请求相同参数不重复发
  const key = method === 'GET' ? dedupeKey(url, payload, method) : '';
  if (key && pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const doRequest = (attempt: number): Promise<T> =>
    instance
      .request<T>({
        baseURL: `http://127.0.0.1:${window.electron.getPort()}`,
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? payload : null,
        params: !['POST', 'PUT'].includes(method) ? payload : null,
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        ...restConfig,
      })
      .then((res) => checkRes<T>(res.data))
      .catch(async (err: AxiosError) => {
        // 可重试的错误：网络错误或 5xx
        const canRetry =
          attempt < retry &&
          (err.message === 'Network Error' ||
            err.code === 'ECONNABORTED' ||
            (err.response && err.response.status >= 500));

        if (canRetry) {
          console.warn(`[API] 第 ${attempt + 1} 次请求失败，${retryDelay}ms 后重试: ${method} ${url}`);
          await new Promise((r) => setTimeout(r, retryDelay));
          return doRequest(attempt + 1);
        }
        return responseError(err);
      });

  const promise = doRequest(0);

  if (key) {
    pendingRequests.set(key, promise);
    promise.finally(() => {
      pendingRequests.delete(key);
    });
  }

  return promise;
}

/**
 * GET 请求
 * @example const res = await GET<{ data: UserInfo[] }>('/api/users');
 *          // res.data 为 UserInfo[]
 */
export function GET<T = ApiResponse>(
  url: string,
  params: Record<string, unknown> = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, params, config, 'GET');
}

/**
 * POST 请求
 */
export function POST<T = ApiResponse>(
  url: string,
  data: Record<string, unknown> = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'POST');
}

/**
 * PUT 请求
 */
export function PUT<T = ApiResponse>(
  url: string,
  data: Record<string, unknown> = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'PUT');
}

/**
 * DELETE 请求
 */
export function DELETE<T = ApiResponse>(
  url: string,
  data: Record<string, unknown> = {},
  config: ConfigType = {},
): Promise<T> {
  return request<T>(url, data, config, 'DELETE');
}

export default instance;
