import type { Source, TransactionKind } from '../types';

/** Categories seeded by the bundled initial migration (001_initial.sql). */
export const EXPENSE_CATEGORIES = [
  '餐饮',
  '交通',
  '购物',
  '住房',
  '生活缴费',
  '医疗',
  '娱乐',
  '教育',
  '旅行',
  '其他',
] as const;

/** Categories the classifier assigns outside the seeded expense list. */
export const SYSTEM_CATEGORIES = ['收入', '退款', '内部转账', '待确认'] as const;

export const SOURCE_LABELS: Record<Source, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  other: '其他来源',
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: '支出',
  income: '收入',
  transfer: '内部转账',
  refund: '退款',
  cancelled: '已取消',
  pending: '待确认',
};

export const KIND_TONES: Record<TransactionKind, string> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  refund: 'refund',
  cancelled: 'cancelled',
  pending: 'pending',
};

export const KIND_OPTIONS: Array<{ value: TransactionKind; label: string }> = (
  Object.keys(KIND_LABELS) as TransactionKind[]
).map((value) => ({ value, label: KIND_LABELS[value] }));

export const SOURCE_OPTIONS: Array<{ value: Source; label: string }> = (
  Object.keys(SOURCE_LABELS) as Source[]
).map((value) => ({ value, label: SOURCE_LABELS[value] }));

/**
 * Merge category names from the schema, the loaded data and a current value.
 * Keeps display order stable and drops blanks/duplicates.
 */
export function categoryOptions(...groups: Array<Iterable<string> | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const raw of group) {
      const value = raw.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}
