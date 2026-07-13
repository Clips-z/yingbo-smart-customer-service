export interface QianniuFillResult {
  success: boolean;
  selected: boolean;
  filled: boolean;
  submitted: boolean;
  errorCode?: string;
  error?: string;
}

export function parseQianniuFillResult(stdout: string): QianniuFillResult {
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) throw new Error('千牛填入脚本未返回结果');
  let value: Partial<QianniuFillResult>;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error('千牛填入脚本返回了无效结果');
  }
  if (typeof value.success !== 'boolean')
    throw new Error('千牛填入结果缺少 success 字段');
  return {
    success: value.success,
    selected: value.selected === true,
    filled: value.filled === true,
    submitted: value.submitted === true,
    errorCode: value.errorCode,
    error: value.error,
  };
}

export function assertQianniuFillResult(
  result: QianniuFillResult,
  stage: 'select' | 'fill',
  submitExpected: boolean,
): void {
  if (!result.success) throw new Error(result.error || result.errorCode || '千牛操作失败');
  if (stage === 'select' && !result.selected)
    throw new Error('千牛未确认选中目标联系人');
  if (stage === 'fill' && !result.filled)
    throw new Error('千牛未确认回复已填入');
  if (stage === 'fill' && result.submitted !== submitExpected)
    throw new Error('千牛回复提交状态与请求不一致');
}
