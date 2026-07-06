import { OpenAIError } from 'openai';

export const castToError = (err: any): Error => {
  if (err instanceof Error) return err;
  return new Error(err);
};

export function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 创建一个 AbortController，并将其与外部 signal 关联
 * 当外部 signal 触发 abort 时，内部 controller 也会 abort
 *
 * 所有 LLM 供应商的流式请求都使用此模式
 */
export function createStreamController(
  externalSignal?: AbortSignal,
): AbortController {
  const controller = new AbortController();

  if (externalSignal) {
    // 如果外部 signal 已经 aborted，直接 abort
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => {
        controller.abort();
      });
    }
  }

  return controller;
}

/**
 * 验证模型名称是否在允许的列表中
 * 如果不在列表中，抛出 OpenAIError
 */
export function validateModel<T extends string>(
  model: string,
  allowedModels: Record<T, unknown>,
): void {
  if (!(model in allowedModels)) {
    throw new OpenAIError(`Invalid model: ${model}`);
  }
}
