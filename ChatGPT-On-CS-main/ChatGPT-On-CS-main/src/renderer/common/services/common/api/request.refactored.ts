/**
 * 重构后的 API 请求层 — 类型安全版本
 *
 * 主要改进：
 * 1. 统一的 ApiResponse<T> 类型，不再用 any
 * 2. 统一的 ApiError 错误类
 * 3. 支持 AbortSignal（请求取消）
 * 4. 自动清理 null/undefined 字段
 * 5. 直接返回 data，调用方不用 .data.data
 */
import axios, {
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

// ============ 类型定义 ============

/** 统一 API 响应格式 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 统一错误类 */
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 是否是业务错误（vs 网络错误） */
  get isBusinessError(): boolean {
    return this.code >= 200 && this.code < 500;
  }
}

/** 请求配置 */
export interface RequestConfig {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

// ============ Axios 实例 ============

const apiClient = axios.create({
  timeout: 60000,
  headers: { 'content-type': 'application/json' },
});

// 请求拦截：自动带 token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：检查业务错误
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const body = response.data;
    // code 不在 200-399 范围视为业务错误
    if (body.code < 200 || body.code >= 400) {
      throw new ApiError(body.code, body.message, body.data);
    }
    return response;
  },
  (error) => {
    // 网络错误、超时等
    if (axios.isCancel(error)) {
      throw new ApiError(-1, '请求已取消');
    }
    if (error.message === 'Network Error') {
      throw new ApiError(503, '服务不可用，请检查网络');
    }
    if (error.code === 'ECONNABORTED') {
      throw new ApiError(408, '请求超时，请稍后重试');
    }
    if (error.response) {
      const { status, data } = error.response;
      throw new ApiError(
        status,
        data?.message || `请求失败 (${status})`,
        data,
      );
    }
    throw new ApiError(500, error.message || '未知错误');
  },
);

// ============ 工具函数 ============

/** 清理 null/undefined 字段 */
function cleanData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value != null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** 获取 API baseURL（延迟读取，确保 port 已初始化） */
function getBaseURL(): string {
  return `http://127.0.0.1:${window.electron.getPort()}`;
}

// ============ 核心请求方法 ============

/**
 * 通用请求方法
 * @example
 * // GET 请求
 * const users = await request<User[]>('GET', '/api/users');
 *
 * // POST 请求，支持取消
 * const controller = new AbortController();
 * const result = await request<CreateResult>('POST', '/api/create', data, {
 *   signal: controller.signal,
 * });
 * // 取消：controller.abort()
 */
export function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<T> {
  return apiClient
    .request<ApiResponse<T>>({
      baseURL: getBaseURL(),
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? cleanData(data) : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined,
      signal: config?.signal,
      headers: config?.headers,
      timeout: config?.timeout,
    })
    .then((res) => res.data.data); // 直接返回 data，调用方更方便
}

// ============ 便捷方法 ============

/** GET 请求 */
export function GET<T = unknown>(
  url: string,
  params?: Record<string, unknown>,
  config?: RequestConfig,
): Promise<T> {
  return request<T>('GET', url, params, config);
}

/** POST 请求 */
export function POST<T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<T> {
  return request<T>('POST', url, data, config);
}

/** PUT 请求 */
export function PUT<T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<T> {
  return request<T>('PUT', url, data, config);
}

/** DELETE 请求 */
export function DELETE<T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<T> {
  return request<T>('DELETE', url, data, config);
}

// ============ 使用示例 ============

/*
// ✅ 使用前（旧代码）
const res = await GET('/api/messages', { sessionId });
// res 是 any 类型，IDE 没有提示

// ✅ 使用后（新代码）
interface Message {
  id: number;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}
const messages = await GET<Message[]>('/api/messages', { sessionId });
// messages 是 Message[] 类型，有完整 IDE 提示

// ✅ 错误处理
try {
  await POST('/api/keyword', { keyword: 'hello' });
} catch (err) {
  if (err instanceof ApiError) {
    // 业务错误：显示用户友好提示
    toast.error(err.message);
  } else {
    // 未知错误：记录日志
    logger.error('Keyword', '创建失败', err);
  }
}

// ✅ 请求取消（组件卸载时取消进行中的请求）
function useKeywordList() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    GET<Keyword[]>('/api/keywords', undefined, { signal: controller.signal })
      .then(setKeywords)
      .catch((err) => {
        if (err.code !== -1) {  // -1 = 取消，不报错
          logger.error('Keyword', '加载失败', err);
        }
      });
    return () => controller.abort();
  }, []);

  return keywords;
}
*/
