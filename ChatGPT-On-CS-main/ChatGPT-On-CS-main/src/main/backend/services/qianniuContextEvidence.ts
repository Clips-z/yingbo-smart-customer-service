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

function parseStoreAccount(text: string) {
  const normalized = clean(text);
  const match = normalized.match(/^(.{2,60})[:：;；]+([A-Za-z][\w.-]{1,40})$/);
  if (!match) return undefined;
  const store = clean(match[1]).replace(/[:：;；]+$/, '');
  const account = clean(match[2]);
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
): QianniuContextEvidence {
  const rows = groupedRows(lines);
  const evidence: QianniuContextEvidence = {};

  const topLines = lines.filter((line) => line.y <= 90);
  const activeLines = topLines.filter((line) => line.active_tab);
  const parsedTopLines = topLines
    .map((line) => parseStoreAccount(line.text))
    .filter((item): item is { store: string; account: string } => Boolean(item));
  const accountEvidence =
    activeLines.map((line) => parseStoreAccount(line.text)).find(Boolean) ||
    (activeLines.length === 0 && parsedTopLines.length === 1
      ? parsedTopLines[0]
      : undefined) ||
    (parsedTopLines.length === 0
      ? rows
          .filter((row) => row.y <= 90)
          .map((row) => parseStoreAccount(row.text))
          .find(Boolean)
      : undefined);
  if (accountEvidence) {
    evidence.storeId = accountEvidence.store;
    evidence.storeName = accountEvidence.store;
    evidence.accountId = accountEvidence.account;
    evidence.accountName = accountEvidence.account;
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
