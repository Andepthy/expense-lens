import { describe, expect, it } from 'vitest';
import { classifyRow } from './classify';

describe('row classification', () => {
  it('excludes a self-account top-up only when type and account context agree', () => {
    expect(classifyRow({ '交易类型': '充值', '收/支': '支出', '支付方式': '银行卡转入零钱' }).kind).toBe('transfer');
    expect(classifyRow({ '交易类型': '转账', '收/支': '', '交易对方': '张三' }).kind).toBe('pending');
  });
  it('keeps refund separate from ordinary income and ignores cancelled payments', () => {
    expect(classifyRow({ '交易类型': '退款', '收/支': '收入' }).kind).toBe('refund');
    expect(classifyRow({ '交易类型': '消费', '当前状态': '已取消', '收/支': '支出' }).included).toBe(false);
  });
});
