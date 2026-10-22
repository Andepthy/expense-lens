import type { Transaction } from '../types';

export type DuplicateMatch = { status: 'certain' | 'suspected' | 'new'; candidate?: Transaction; reason?: string };

export function fingerprint(tx: Pick<Transaction, 'source' | 'occurredAt' | 'amountCents' | 'kind' | 'merchant' | 'description' | 'paymentMethod' | 'status'>): string {
  return [tx.source, tx.occurredAt.slice(0, 19), tx.amountCents, tx.kind, normalize(tx.merchant), normalize(tx.description), normalize(tx.paymentMethod), normalize(tx.status)].join('|');
}

export function detectDuplicate(candidate: Transaction, existing: Transaction[]): DuplicateMatch {
  if (candidate.platformId) {
    const match = existing.find((item) => item.source === candidate.source && item.platformId === candidate.platformId);
    if (match) return { status: 'certain', candidate: match, reason: '来源平台交易单号相同' };
  }
  const exact = existing.find((item) => item.source === candidate.source && !(item.platformId && candidate.platformId && item.platformId !== candidate.platformId) && !(item.platformId && !candidate.platformId) && item.fingerprint === candidate.fingerprint && item.occurredAt === candidate.occurredAt && item.amountCents === candidate.amountCents);
  if (exact) return { status: 'certain', candidate: exact, reason: '来源、时间、金额与规范化交易指纹完全一致' };
  const close = existing.find((item) => item.source === candidate.source && item.amountCents === candidate.amountCents && Math.abs(Date.parse(item.occurredAt) - Date.parse(candidate.occurredAt)) <= 120_000 && normalize(item.merchant) === normalize(candidate.merchant) && normalize(item.description) === normalize(candidate.description));
  if (close) return { status: 'suspected', candidate: close, reason: '时间、金额和商户相似，需人工确认' };
  return { status: 'new' };
}

function normalize(value: string): string { return value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLocaleLowerCase(); }
