import { formatMoney } from '../domain/money';
import type { Transaction } from '../types';

export { formatMoney } from '../domain/money';

export type AmountSign = '+' | '−' | '';

/** Render an absolute amount with an explicit business sign. */
export function signedMoney(cents: number, sign: AmountSign): string {
  const absolute = formatMoney(Math.abs(cents));
  return sign ? `${sign}${absolute}` : absolute;
}

/** Expense leaves the account; income and refunds return money. */
export function transactionSign(tx: Pick<Transaction, 'kind' | 'direction'>): AmountSign {
  if (tx.kind === 'expense') return '−';
  if (tx.kind === 'income' || tx.kind === 'refund') return '+';
  if (tx.kind === 'transfer') {
    if (/收入|转入/.test(tx.direction)) return '+';
    if (/支出|转出/.test(tx.direction)) return '−';
  }
  return '';
}

export function formatTransactionAmount(tx: Pick<Transaction, 'amountCents' | 'kind' | 'direction'>): string {
  return signedMoney(tx.amountCents, transactionSign(tx));
}

/** Dates in the database are local wall-clock strings; slice instead of re-parsing time zones. */
export function formatDate(value: string): string {
  return value.slice(0, 10);
}

export function formatDateTime(value: string): string {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

export function formatTime(value: string): string {
  return value.slice(11, 16);
}

export function formatMonth(value: string): string {
  const [year, month] = value.split('-');
  return year && month ? `${year}年${Number(month)}月` : value;
}

export function formatDay(value: string): string {
  const parts = value.split('-');
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : value;
}

export function formatCount(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index] ?? 'B'}`;
}

export function formatCompactMoney(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10_000) return `¥${(yuan / 10_000).toFixed(1)}万`;
  if (Math.abs(yuan) >= 1_000) return `¥${(yuan / 1_000).toFixed(1)}千`;
  return `¥${yuan.toFixed(0)}`;
}

export interface MoneyDelta {
  text: string;
  direction: 'up' | 'down' | 'flat';
}

/** Compare a current period with the previous one; exposes no percentage when the base is empty. */
export function formatDelta(current: number, previous: number): MoneyDelta {
  if (previous === 0) return { text: current === 0 ? '持平' : '上期无数据', direction: 'flat' };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 0.05) return { text: '持平', direction: 'flat' };
  return {
    text: `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`,
    direction: change > 0 ? 'up' : 'down',
  };
}

export function relativeDayLabel(value: string, today = new Date()): string {
  const day = formatDate(value);
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (day === now) return '今天';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return day === yesterdayKey ? '昨天' : day;
}
