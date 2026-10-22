/** Parse a decimal currency value without using binary floating point arithmetic. */
export function parseCents(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const [whole, fraction = ''] = input.toString().split('.');
    const cents = Number(`${whole}${fraction.padEnd(2, '0').slice(0, 2)}`);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/[￥¥,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d{1,}))?$/);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const extra = fraction.slice(2);
  // Reject precision that cannot be represented as exact cents rather than silently round it.
  if (extra && /[1-9]/.test(extra)) return null;
  const cents = Number(match[2]) * 100 + Number(fraction.slice(0, 2));
  return Number.isSafeInteger(cents) ? sign * cents : null;
}

export function formatMoney(cents: number): string {
  const yuan = Math.abs(cents) / 100;
  return `${cents < 0 ? '−' : ''}¥${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
