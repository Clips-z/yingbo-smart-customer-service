/* ─────────────────────────────────────────────────────────────
 * 问答语料测试 —— 数据类型与 Mock 匹配服务
 * 说明：前端语料测试（输入问题 → 在知识库中匹配最相似 QA）。
 * ───────────────────────────────────────────────────────────── */

import { QAItem } from './storeKB';

export interface CorpusTestResult {
  query: string;
  matched: QAItem | null;
  score: number; // 0~100 匹配度
  candidates: { item: QAItem; score: number }[];
}

/**
 * 简易中文相似度匹配（字符重合度 + 子串包含）
 * 纯前端 mock，用于演示语料测试流程
 */
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;

  // 子串包含加权
  let score = 0;
  if (s2.includes(s1) || s1.includes(s2)) score += 60;

  // 字符重合度（Jaccard）
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  let inter = 0;
  set1.forEach((c) => {
    if (set2.has(c)) inter++;
  });
  const union = new Set([...set1, ...set2]).size;
  const jac = union ? inter / union : 0;
  score += jac * 40;

  return Math.min(100, Math.round(score));
}

/** 在知识库 QA 中匹配最佳结果 */
export function runCorpusTest(query: string, corpus: QAItem[]): CorpusTestResult {
  const candidates = corpus
    .map((item) => ({
      item,
      score: Math.max(
        similarity(query, item.question),
        similarity(query, item.answer),
        ...item.relatedQuestions.map((rq) => similarity(query, rq))
      ),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top = candidates[0] ?? null;
  return {
    query,
    matched: top ? top.item : null,
    score: top ? top.score : 0,
    candidates,
  };
}
