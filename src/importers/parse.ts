import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { ParseIssue, ParseResult, ParsedRow, Source, Transaction } from '../types';
import { parseCents } from '../domain/money';
import { classifyRow } from '../domain/classify';
import { fingerprint } from '../domain/deduplicate';
import { z } from 'zod';

const normalizedTransactionSchema = z.object({
  id: z.string().min(1), source: z.enum(['wechat','alipay','other']),
  occurredAt: z.string().min(10), amountCents: z.number().int().safe(),
  kind: z.enum(['expense','income','transfer','refund','cancelled','pending']),
  category: z.string().min(1), rawJson: z.string(),
});

const aliases: Record<string, string[]> = {
  time: ['交易时间', '交易创建时间', '完成时间', '付款时间', '创建时间', '日期'],
  type: ['交易类型', '交易分类', '类型'],
  merchant: ['交易对方', '商户名称', '商家名称', '对方名称', '交易对象'],
  description: ['商品', '商品说明', '商品名称', '备注', '交易说明'],
  direction: ['收/支', '收支', '资金方向'],
  amount: ['金额(元)', '金额（元）', '金额', '交易金额'],
  method: ['支付方式', '收/付款方式', '资金渠道', '支付渠道'],
  status: ['当前状态', '交易状态', '状态'],
  platformId: ['交易单号', '交易订单号', '平台交易号'],
  rawCategory: ['交易分类', '商品分类', '原始分类'],
};

const categories = [
  ['餐饮', /餐|饭|咖啡|奶茶|饮品|外卖/], ['交通', /地铁|公交|打车|滴滴|高铁|火车/],
  ['购物', /超市|便利店|购物|淘宝|天猫|京东|拼多多/], ['住房', /房租|物业|住房/],
  ['生活缴费', /水费|电费|燃气|话费|宽带|缴费/], ['医疗', /医院|药店|医疗|诊疗/],
  ['娱乐', /电影|游戏|娱乐|视频会员/], ['教育', /课程|书店|教育|培训/], ['旅行', /酒店|机票|旅行|旅游/],
] as const;

export async function parseBill(file: File, manualMapping: Record<string, number> = {}): Promise<ParseResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const csv = file.name.toLocaleLowerCase().endsWith('.csv');
  const source: Source = csv ? 'alipay' : 'wechat';
  const rows: string[][] = csv ? parseCsv(bytes) : parseXlsx(bytes);
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 80); i += 1) {
    if (rows[i]?.some((value) => aliases.time?.includes(clean(value))) && rows[i]?.some((value) => aliases.amount?.includes(clean(value)))) { headerIndex = i; break; }
  }
  if (headerIndex < 0) {
    headerIndex=rows.slice(0,80).reduce((best,row,index)=>((row?.filter(value=>clean(value)).length??0)>(rows[best]?.filter(value=>clean(value)).length??0)?index:best),0);
    if ((rows[headerIndex]?.filter(value=>clean(value)).length??0)<3) throw new Error('无法定位账单表头。请确认文件格式或选择正确的账单。');
  }
  const headers = (rows[headerIndex] ?? []).map((v) => clean(v));
  const mapping: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const index = headers.findIndex((header) => names.includes(header));
    if (index >= 0) mapping[field] = index;
  }
  Object.assign(mapping, manualMapping);
  const mappingNeeded = mapping.time === undefined || mapping.amount === undefined || mapping.direction === undefined;
  const parsed: ParsedRow[] = [];
  const issues: ParseIssue[] = [];
  const data = rows.slice(headerIndex + 1);
  data.forEach((row, index) => {
    if (!row.some((v) => clean(v))) return;
    const raw = Object.fromEntries(headers.map((header, col) => [header || `列${col + 1}`, clean(row[col] ?? '')]));
    const at = value(row, mapping.time);
    const amountRaw = value(row, mapping.amount);
    const occurredAt = parseDate(at);
    const amountCents = parseCents(amountRaw);
    if (!occurredAt || amountCents === null) {
      issues.push({ rowNumber: headerIndex + index + 2, reason: !occurredAt ? '交易时间缺失或格式无法识别' : '金额缺失或不是有效的分币金额', raw });
      return;
    }
    const fields: Record<string, string> = { ...raw,
      '交易类型': value(row, mapping.type), '交易对方': value(row, mapping.merchant),
      '商品说明': value(row, mapping.description), '收/支': value(row, mapping.direction),
      '支付方式': value(row, mapping.method), '当前状态': value(row, mapping.status),
    };
    const classification = classifyRow(fields);
    const merchant = value(row, mapping.merchant) || '未标记对象';
    const description = value(row, mapping.description) || value(row, mapping.type);
    const now = new Date().toISOString();
    const tx: Transaction = {
      id: crypto.randomUUID(), source, platformId: value(row, mapping.platformId) || null,
      occurredAt, amountCents: Math.abs(amountCents), kind: classification.kind,
      direction: value(row, mapping.direction), merchant, description,
      paymentMethod: value(row, mapping.method), rawCategory: value(row, mapping.rawCategory),
      category: categorize(classification.category, `${merchant} ${description}`),
      status: value(row, mapping.status), linkedTransactionId: null,
      included: classification.included, exclusionReason: classification.exclusionReason,
      ruleReason: classification.reason, batchId: '', rawJson: JSON.stringify(raw), fingerprint: '',
      manuallyModified: false, createdAt: now, updatedAt: now,
    };
    tx.fingerprint = fingerprint(tx);
    const validated = normalizedTransactionSchema.safeParse(tx);
    if (!validated.success) {
      issues.push({ rowNumber: headerIndex + index + 2, reason: '标准化校验未通过', raw });
      return;
    }
    parsed.push({ transaction: tx, rowNumber: headerIndex + index + 2 });
  });
  linkRefunds(parsed);
  const rowCount=data.filter(row=>row.some(value=>clean(value))).length;
  return { source, headers, parsed, issues, rowCount, mappingNeeded, mapping, filename: file.name };
}

function linkRefunds(parsed:ParsedRow[]):void{
  const expenses=parsed.filter(row=>row.transaction.kind==='expense');
  for(const row of parsed.filter(item=>item.transaction.kind==='refund')){
    const refund=row.transaction;
    const candidates=expenses.filter(({transaction:expense})=>expense.source===refund.source&&expense.amountCents===refund.amountCents&&normalizeText(expense.merchant)===normalizeText(refund.merchant)&&Date.parse(refund.occurredAt)>=Date.parse(expense.occurredAt)&&Date.parse(refund.occurredAt)-Date.parse(expense.occurredAt)<=45*24*60*60*1000);
    if(candidates.length===1){refund.linkedTransactionId=candidates[0]?.transaction.id??null;refund.included=true;refund.ruleReason+='；通过来源、商户、金额和 45 天时间窗关联到唯一原消费';}
    else{refund.included=false;refund.exclusionReason='未匹配退款，待确认关联';refund.ruleReason+='；没有唯一匹配的原消费，待人工确认';}
  }
}
function normalizeText(value:string):string{return value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLocaleLowerCase();}

function parseCsv(bytes: Uint8Array): string[][] {
  let text: string;
  const isUtf8Bom=bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { text = new TextDecoder('gb18030').decode(bytes); }
  if(isUtf8Bom)text=new TextDecoder('utf-8').decode(bytes);
  // Some Alipay exports mix CRLF in the preamble with LF in the transaction table.
  // Papa Parse detects one newline style from the file prefix, so normalize first.
  const normalizedText=text.replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g,'\n');
  const result = Papa.parse<string[]>(normalizedText, { skipEmptyLines: false });
  return result.data;
}

function parseXlsx(bytes: Uint8Array): string[][] {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('XLSX 文件没有可读取的工作表。');
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
}

function parseDate(value: string): string | null {
  const normalized = value.trim().replace(/[年/.]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\s+/g, ' ').replace(/(T\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i,'$1');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!match) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(Number(mo))}-${pad(Number(d))}T${pad(Number(h))}:${pad(Number(mi))}:${pad(Number(s))}`;
}

function categorize(defaultCategory: string, context: string): string {
  if (defaultCategory !== '其他') return defaultCategory;
  return categories.find(([, pattern]) => pattern.test(context))?.[0] ?? defaultCategory;
}
function clean(value: unknown): string { return String(value ?? '').trim().replace(/^\uFEFF/, ''); }
function value(row: string[], index: number | undefined): string { return index === undefined ? '' : clean(row[index]); }
