import { describe, expect, it } from 'vitest';
import { detectDuplicate, fingerprint } from './deduplicate';
import type { Transaction } from '../types';

const base: Transaction = { id:'1',source:'alipay',platformId:'order-1',occurredAt:'2026-01-01T12:00:00',amountCents:1200,kind:'expense',direction:'支出',merchant:'便利店',description:'矿泉水',paymentMethod:'余额',rawCategory:'',category:'购物',status:'成功',linkedTransactionId:null,included:true,exclusionReason:null,ruleReason:'test',batchId:'b1',rawJson:'{}',fingerprint:'',manuallyModified:false,createdAt:'',updatedAt:'' };
describe('duplicate detection', () => {
  it('uses platform IDs as strongest evidence', () => {
    const candidate = { ...base, id:'2' };
    expect(detectDuplicate(candidate, [base]).status).toBe('certain');
  });
  it('does not merge equal value purchases with different platform IDs', () => {
    const one = { ...base, platformId:'order-1', fingerprint:fingerprint(base) };
    const two = { ...base, id:'2', platformId:'order-2', occurredAt:'2026-01-01T13:00:00', fingerprint:fingerprint({ ...base, occurredAt:'2026-01-01T13:00:00' }) };
    expect(detectDuplicate(two, [one]).status).toBe('new');
  });
});
