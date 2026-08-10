/* eslint-disable no-restricted-syntax, no-nested-ternary */
import { QianniuOcrResult } from './qianniuOcrWorker';

type OcrLine = QianniuOcrResult['lines'][number];

export interface QianniuContextEvidence {
  storeId?: string;
  storeName?: string;
  accountId?: string;
  accountName?: string;
  productId?: string;
  productTitle?: string;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeQianniuStoreName(value?: string): string {
  let compact = clean(value || '').replace(/\s+/g, '');
  if (!compact) return '';
  if (!/^[\u4e00-\u9fffA-Za-z0-9_.-]+$/u.test(compact)) return '';
  // Stable corrections observed from the selected QianNiu tab. Keep this
  // deliberately narrow: never invent a shop from arbitrary OCR text.
  if (/^passonipaul$/i.test(compact)) compact = 'passionpaul';
  if (/^wheeltech$/i.test(compact)) compact = 'wheeltec';
  // In the selected QianNiu tab, Windows OCR repeatedly reads “旗舰店” as
  // “牌 店”. Preserve the legitimate “品牌店” suffix while repairing the
  // impossible standalone “牌店” suffix observed on the live client.
  if (compact.endsWith('牌店') && !compact.endsWith('品牌店')) {
    return `${compact.slice(0, -2)}旗舰店`;
  }
  return compact;
}

function editDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[b.length];
}

function parseStoreAccount(text: string, accountHint?: string) {
  const normalized = clean(text);
  const match = normalized.match(/^(.{2,60})[:：;；]+([A-Za-z][\w.-]{1,40})$/);
  if (match) {
    const store = normalizeQianniuStoreName(match[1].replace(/[:：;；]+$/, ''));
    const account = clean(match[2]);
    return store && account ? { store, account } : undefined;
  }
  const hint = clean(accountHint || '');
  if (
    hint &&
    normalized.length > hint.length + 1 &&
    normalized.toLowerCase().endsWith(hint.toLowerCase())
  ) {
    const store = normalizeQianniuStoreName(normalized.slice(0, -hint.length));
    return store ? { store, account: hint } : undefined;
  }
  if (hint) {
    const compactText = normalized.replace(/\s+/g, '');
    const trailingAscii = compactText.match(/([A-Za-z][A-Za-z0-9_.-]{4,})$/)?.[1];
    for (const candidateText of [compactText, trailingAscii].filter(Boolean) as string[]) {
      for (let suffixLength = Math.max(2, hint.length - 1); suffixLength <= hint.length + 1; suffixLength += 1) {
        if (candidateText.length <= suffixLength + 1) continue;
        const suffix = candidateText.slice(-suffixLength);
        if (editDistance(suffix, hint) > 1) continue;
        const store = normalizeQianniuStoreName(candidateText.slice(0, -suffixLength));
        if (store) return { store, account: hint };
      }
    }
  }
  // Windows OCR commonly inserts spaces between a Chinese shop suffix and
  // the agent account: "wheeltech 品牌店 jamie".
  const spacedBoundary = normalized.match(
    /^(.{2,60}[\u4e00-\u9fff])\s+([A-Za-z][\w.-]{1,40})$/u,
  );
  if (spacedBoundary) {
    const store = normalizeQianniuStoreName(spacedBoundary[1]);
    const account = clean(spacedBoundary[2]);
    return store && account ? { store, account } : undefined;
  }
  const boundary = normalized.match(/^(.{2,60}[\u4e00-\u9fff])([A-Za-z][\w.-]{1,40})$/u);
  if (!boundary) return undefined;
  const store = normalizeQianniuStoreName(boundary[1]);
  const account = clean(boundary[2]);
  return store && account ? { store, account } : undefined;
}

function groupedRows(lines: OcrLine[]): Array<{ text: string; x: number; y: number }> {
  const rows: OcrLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((items) => Math.abs(items[0].y - line.y) <= 8);
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows.map((items) => ({
    text: clean([...items].sort((a, b) => a.x - b.x).map((item) => item.text).join('')),
    x: Math.min(...items.map((item) => item.x)),
    y: Math.min(...items.map((item) => item.y)),
  }));
}

function isProductTitle(text: string): boolean {
  return (
    text.length >= 5 &&
    text.length <= 120 &&
    !/^(ID|商品ID|SKU|属性|库存|销量|¥|￥|\d+[.\d]*)/i.test(text) &&
    !/(历史订单|近\d+个月订单|发送宝贝|邀请下单|优惠计算)/.test(text)
  );
}

export function extractQianniuContextEvidence(
  lines: OcrLine[],
  accountHintOverride?: string,
  activeTabSlot?: number,
): QianniuContextEvidence {
  const rows = groupedRows(lines);
  const evidence: QianniuContextEvidence = {};

  const topLines = lines.filter((line) => line.y <= 90);
  const activeLines = topLines.filter((line) => line.active_tab);
  const accountHint = clean(accountHintOverride || '') || lines
    .filter((line) => line.y >= 70 && line.y <= 135 && line.x <= 300)
    .map((line) => clean(line.text))
    .find((text) => /^[A-Za-z][\w.-]{1,40}$/.test(text));
  const parsedTopLines = topLines
    .map((line) => parseStoreAccount(line.text, accountHint))
    .filter((item): item is { store: string; account: string } => Boolean(item));
  const rowEvidence = rows
    .filter((row) => row.y <= 90)
    .map((row) => parseStoreAccount(row.text, accountHint))
    .filter((item): item is { store: string; account: string } => Boolean(item));
  const accountEvidence =
    activeLines.map((line) => parseStoreAccount(line.text, accountHint)).find(Boolean) ||
    // Never guess from the rightmost visible tab. When the selected-tab
    // marker is unavailable, multiple tabs are ambiguous and the caller can
    // safely retain the previous live context instead of assigning the wrong
    // shop (which used to make every conversation look like 旗舰店).
    (activeLines.length === 0 && parsedTopLines.length === 1
      ? parsedTopLines[0]
      : parsedTopLines.length === 0 && rowEvidence.length === 1
        ? rowEvidence[0]
        : undefined);
  // These are the four QianNiu account tabs configured in this workstation.
  // The selected blue tab position is stable while its white Chinese glyphs
  // are repeatedly corrupted by Windows OCR. Prefer the verified slot map;
  // text evidence still supplies the account and remains the fallback for
  // additional tabs.
  const configuredStoreBySlot = [
    '轮趣旗舰店',
    'passionpaul',
    'wheeltec旗舰店',
    'wheeltec品牌店',
  ];
  const slotStore = Number.isInteger(activeTabSlot)
    ? configuredStoreBySlot[activeTabSlot as number]
    : undefined;
  if (accountEvidence || slotStore) {
    const store = slotStore || accountEvidence?.store || '';
    const account =
      accountEvidence?.account ||
      clean(accountHintOverride || '') ||
      (slotStore ? 'jamie' : '');
    evidence.storeId = store;
    evidence.storeName = store;
    if (account) {
      evidence.accountId = account;
      evidence.accountName = account;
    }
  }

  const productLine = lines
    .map((line) => {
      const text = clean(line.text);
      const explicit = text.match(/(?:商品)?ID\s*[:：]?\s*(\d{8,20})/i);
      const numeric = line.x >= 800 ? text.match(/^\s*(\d{10,20})\s*$/) : null;
      return { line, id: explicit?.[1] || numeric?.[1] };
    })
    .find((item) => item.id);

  if (productLine?.id) {
    evidence.productId = productLine.id;
    const title = lines
      .filter(
        (line) =>
          line.x >= 760 &&
          line.y >= productLine.line.y - 150 &&
          line.y <= productLine.line.y + 35,
      )
      .map((line) => ({ ...line, text: clean(line.text) }))
      .filter((line) => line.text && isProductTitle(line.text))
      .sort((left, right) => {
        const leftBefore = left.y <= productLine.line.y ? 0 : 1;
        const rightBefore = right.y <= productLine.line.y ? 0 : 1;
        return leftBefore - rightBefore || right.y - left.y;
      })[0];
    if (title) evidence.productTitle = title.text;
  }

  return evidence;
}
