import type { TransactionKind } from '../types';

const expenseCategories: Array<[RegExp, string]> = [
  [/餐|饭|咖啡|奶茶|饮品|外卖|餐厅/i, '餐饮'],
  [/地铁|公交|打车|滴滴|交通|高铁|火车|航空/i, '交通'],
  [/超市|便利店|购物|淘宝|天猫|京东|拼多多/i, '购物'],
  [/房租|物业|住房/i, '住房'],
  [/水费|电费|燃气|话费|宽带|缴费/i, '生活缴费'],
  [/医院|药店|医疗|诊疗/i, '医疗'],
  [/电影|游戏|娱乐|视频会员/i, '娱乐'],
  [/课程|书店|教育|培训/i, '教育'],
  [/酒店|机票|旅行|旅游/i, '旅行'],
];

export interface Classification { kind: TransactionKind; included: boolean; category: string; reason: string; exclusionReason: string | null }

/** Use status, transaction type, direction and context together; ambiguous rows remain pending. */
export function classifyRow(fields: Record<string, string>): Classification {
  const text = Object.values(fields).join(' ');
  const status = get(fields, ['当前状态', '交易状态', '状态']);
  const type = get(fields, ['交易类型', '交易分类', '类型']);
  const direction = get(fields, ['收/支', '收支', '资金方向']);
  const method = get(fields, ['支付方式', '收/付款方式', '资金渠道']);
  const statusText = `${status} ${type}`;
  if (/关闭|已取消|已撤销|交易失败|等待付款/.test(statusText)) return { kind: 'cancelled', included: false, category: '其他', reason: `状态/类型字段为“${status || type}”`, exclusionReason: '交易未完成或已取消' };
  if (/退款|退回/.test(type) || /退款|退回/.test(get(fields, ['商品', '商品说明', '备注']))) return { kind: 'refund', included: true, category: '退款', reason: '交易类型或描述标记为退款', exclusionReason: null };
  if (/充值|提现|账户间转入|账户间转出/.test(type) && /零钱|余额|银行卡|储蓄卡|信用卡/.test(`${method} ${text}`)) {
    return { kind: 'transfer', included: false, category: '内部转账', reason: `交易类型“${type}”与资金渠道信息共同指向账户划转`, exclusionReason: '自有账户之间的资金划转不计入消费或收入' };
  }
  if (/转账/.test(type) && !/银行卡|零钱|余额|本人|自己/.test(text)) return { kind: 'pending', included: false, category: '待确认', reason: '转账对象无法确认是否为自有账户', exclusionReason: '待人工确认转账性质' };
  if (/收入/.test(direction)) return { kind: 'income', included: true, category: '收入', reason: '账单收/支字段标记为收入', exclusionReason: null };
  if (/支出/.test(direction)) {
    const description = get(fields, ['商品', '商品说明', '备注', '交易对方']);
    const category = expenseCategories.find(([pattern]) => pattern.test(description))?.[1] ?? '其他';
    return { kind: 'expense', included: true, category, reason: `账单收/支字段标记为支出${category === '其他' ? '；未命中细分类规则' : `；描述命中${category}规则`}`, exclusionReason: null };
  }
  return { kind: 'pending', included: false, category: '待确认', reason: '缺少明确的收支方向或交易状态不明确', exclusionReason: '待人工确认交易性质' };
}

function get(fields: Record<string, string>, keys: string[]): string {
  for (const key of keys) if (fields[key]) return fields[key].trim();
  return '';
}
