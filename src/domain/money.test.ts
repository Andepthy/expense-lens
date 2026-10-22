import { describe, expect, it } from 'vitest';
import { formatMoney, parseCents } from './money';

describe('money helpers', () => {
  it('parses yuan into integer cents without float accumulation', () => {
    expect(parseCents('¥1,234.56')).toBe(123456);
    expect(parseCents('0.10')).toBe(10);
    expect(parseCents('1.001')).toBeNull();
    expect(formatMoney(10)).toBe('¥0.10');
  });
});
