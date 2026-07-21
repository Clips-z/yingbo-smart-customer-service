const RULES: Array<[RegExp, string]> = [
  [/\b1[3-9]\d{9}\b/g, '[手机号]'],
  [/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱]'],
  [/\b(?:\d[ -]?){15,19}\b/g, '[账号]'],
];

export const redactPersonalData = (value: unknown) => RULES.reduce(
  (text, [pattern, replacement]) => text.replace(pattern, replacement),
  String(value ?? ''),
);

export const redactAuditPayload = (payload: Record<string, unknown>) => Object.fromEntries(
  Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? redactPersonalData(value) : value]),
);
