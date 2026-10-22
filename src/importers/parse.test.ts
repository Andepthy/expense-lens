import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBill } from './parse';

describe('local bill adapters', () => {
  it('finds the Alipay header after export metadata and parses UTF-8 BOM CSV', async () => {
    const content = '\uFEFF支付宝交易记录明细\r\n导出交易类型：[全部]\r\n交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号\r\n2026-03-10 08:30:00,线下消费,晨光便利店,饮用水,支出,12.35,支付宝余额,交易成功,ali-001\r\n';
    const file = fileWithBytes('mock-alipay.csv',new TextEncoder().encode(content));
    const result = await parseBill(file);
    expect(result.source).toBe('alipay');
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0]?.transaction.amountCents).toBe(1235);
    expect(result.parsed[0]?.transaction.merchant).toBe('晨光便利店');
    expect(result.parsed[0]?.transaction.kind).toBe('expense');
  });

  it('parses Alipay exports that mix CRLF metadata with LF transaction rows', async () => {
    const content = '支付宝交易明细\r\n导出时间：模拟\r\n\r\n交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号\n2026-03-10 08:30:00,线下消费,模拟便利店,饮用水,支出,12.35,支付宝余额,交易成功,ali-mixed-001\n2026-03-10 09:00:00,退款,模拟便利店,退款,收入,2.00,支付宝余额,交易成功,ali-mixed-002\n';
    const result=await parseBill(fileWithBytes('mixed-newlines.csv',new TextEncoder().encode(content)));
    expect(result.rowCount).toBe(2);
    expect(result.parsed).toHaveLength(2);
    expect(result.parsed.map(row=>row.transaction.amountCents)).toEqual([1235,200]);
  });

  it('scans a WeChat worksheet preamble and reports invalid amount rows', async () => {
    const workbook = XLSX.utils.book_new();
    const rows: unknown[][] = Array.from({ length: 17 }, () => ['微信支付账单流水']);
    rows.push(['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号','商户单号','备注']);
    rows.push(['2026/03/12 12:15:00','商户消费','午间食堂','午餐','支出','18.90','零钱','支付成功','wx-001','','']);
    rows.push(['2026/03/12 12:20:00','商户消费','待清洗','异常金额','支出','--','零钱','支付成功','wx-002','','']);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '账单');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = fileWithBytes('mock-wechat.xlsx',new Uint8Array(bytes));
    const result = await parseBill(file);
    expect(result.source).toBe('wechat');
    expect(result.rowCount).toBe(2);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0]?.transaction.amountCents).toBe(1890);
    expect(result.issues[0]?.reason).toContain('金额');
  });

  it('uses manual mapping when headers are unfamiliar and accepts timezone date strings', async()=>{
    const csv='自定义时间,交易数值,收支口径,对象名称\n2026-03-12T10:15:00+08:00,6.25,支出,模拟面包店\n';
    const file=fileWithBytes('unknown-format.csv',new TextEncoder().encode(csv));
    const result=await parseBill(file,{time:0,amount:1,direction:2,merchant:3});
    expect(result.mappingNeeded).toBe(false);
    expect(result.parsed[0]?.transaction.occurredAt).toBe('2026-03-12T10:15:00');
    expect(result.parsed[0]?.transaction.amountCents).toBe(625);
  });

  it('links a uniquely matching refund and leaves ambiguous refunds for review',async()=>{
    const csv='交易时间,交易类型,交易对方,商品说明,收/支,金额,支付方式,交易状态,交易订单号\n2026-03-10 08:30:00,消费,模拟商户,模拟商品,支出,20.00,余额,成功,expense-1\n2026-03-11 09:00:00,退款,模拟商户,原路退款,收入,20.00,余额,成功,refund-1\n';
    const result=await parseBill(fileWithBytes('refund.csv',new TextEncoder().encode(csv)));
    const expense=result.parsed.find(row=>row.transaction.kind==='expense')?.transaction;
    const refund=result.parsed.find(row=>row.transaction.kind==='refund')?.transaction;
    expect(refund?.linkedTransactionId).toBe(expense?.id);
    expect(refund?.included).toBe(true);
  });
});

function fileWithBytes(name:string,bytes:Uint8Array):File{
  const file=new File([],name);
  Object.defineProperty(file,'arrayBuffer',{value:async()=>bytes.slice().buffer});
  return file;
}
