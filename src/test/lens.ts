import { vi } from 'vitest';
import type { ExpenseLensValue } from '../app/ExpenseLensProvider';
import type {
  CategoryRule,
  DashboardData,
  DatabaseInfo,
  ImportBatch,
  ImportReport,
  ParseResult,
  Transaction,
} from '../types';

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    source: 'wechat',
    platformId: 'wechat-1',
    occurredAt: '2026-10-21T12:30:00',
    amountCents: 1890,
    kind: 'expense',
    direction: '支出',
    merchant: '星巴克',
    description: '拿铁',
    paymentMethod: '零钱',
    rawCategory: '餐饮',
    category: '餐饮',
    status: '支付成功',
    linkedTransactionId: null,
    included: true,
    exclusionReason: null,
    ruleReason: '账单收/支字段标记为支出；描述命中餐饮规则',
    batchId: 'batch-1',
    rawJson: '{}',
    fingerprint: 'fp-1',
    manuallyModified: false,
    createdAt: '2026-10-21T12:30:00Z',
    updatedAt: '2026-10-21T12:30:00Z',
    ...overrides,
  };
}

export function makeDashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    totalExpenseCents: 123_400,
    totalIncomeCents: 500_000,
    refundCents: 5_000,
    netExpenseCents: 118_400,
    transactionCount: 12,
    pendingCount: 2,
    categoryTotals: [
      { category: '餐饮', amountCents: 60_000 },
      { category: '交通', amountCents: 63_400 },
    ],
    dailyTotals: [
      { day: '2026-10-01', expenseCents: 20_000, incomeCents: 0 },
      { day: '2026-10-02', expenseCents: 30_000, incomeCents: 500_000 },
      { day: '2026-10-03', expenseCents: 73_400, incomeCents: 0 },
    ],
    merchantTotals: [
      { merchant: '星巴克', amountCents: 60_000 },
      { merchant: '地铁', amountCents: 63_400 },
    ],
    monthlyTotals: [{ month: '2026-10', expenseCents: 123_400, incomeCents: 500_000 }],
    ...overrides,
  };
}

export function makeInfo(overrides: Partial<DatabaseInfo> = {}): DatabaseInfo {
  return {
    path: 'C:\\Users\\Test\\AppData\\Roaming\\com.expenselens.local\\expenses.db',
    transactionCount: 3,
    schemaVersion: 1,
    sizeBytes: 2_500_000,
    ...overrides,
  };
}

export function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: 'rule-1',
    name: '咖啡关键词',
    pattern: '星巴克',
    category: '餐饮',
    priority: 0,
    enabled: true,
    createdAt: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

export function makeBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 'batch-1',
    filename: '微信支付账单.xlsx',
    source: 'wechat',
    importedAt: '2026-10-21T12:00:00Z',
    addedCount: 42,
    duplicateCount: 3,
    excludedCount: 1,
    undone: false,
    ...overrides,
  };
}

export function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  const transaction = makeTransaction({
    id: 'parsed-1',
    platformId: null,
    batchId: '',
    rawJson: '{"交易对方":"星巴克"}',
  });
  return {
    source: 'alipay',
    headers: ['交易时间', '金额', '收/支', '交易对方'],
    parsed: [{ transaction, rowNumber: 2 }],
    issues: [],
    rowCount: 1,
    mappingNeeded: false,
    mapping: { time: 0, amount: 1, direction: 2, merchant: 3 },
    filename: '支付宝交易明细.csv',
    ...overrides,
  };
}

export type MockDraft = ExpenseLensValue['drafts'][number];

export function makeDraft(overrides: Partial<MockDraft> = {}): MockDraft {
  return {
    file: new File(['mock'], '支付宝交易明细.csv', { type: 'text/csv' }),
    result: makeParseResult(),
    choices: {},
    ...overrides,
  };
}

export function makeImportReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    added: 10,
    duplicates: 2,
    batch: makeBatch({ id: 'import-batch', addedCount: 10, duplicateCount: 2, excludedCount: 1 }),
    ...overrides,
  };
}

export function createMockLens(overrides: Partial<ExpenseLensValue> = {}): ExpenseLensValue {
  const transactions = overrides.transactions ?? [
    makeTransaction(),
    makeTransaction({
      id: 'tx-2',
      platformId: 'wechat-2',
      occurredAt: '2026-10-20T09:00:00',
      amountCents: 500_000,
      kind: 'income',
      direction: '收入',
      merchant: '模拟公司',
      description: '工资',
      category: '收入',
      status: '已入账',
      batchId: 'batch-1',
      fingerprint: 'fp-2',
      ruleReason: '账单收/支字段标记为收入',
    }),
    makeTransaction({
      id: 'tx-3',
      platformId: null,
      occurredAt: '2026-10-19T18:00:00',
      amountCents: 20_000,
      kind: 'pending',
      direction: '转账',
      merchant: '张三',
      description: '转账',
      category: '待确认',
      status: '交易成功',
      included: false,
      exclusionReason: '待人工确认转账性质',
      fingerprint: 'fp-3',
      batchId: 'batch-1',
      ruleReason: '转账对象无法确认是否为自有账户',
    }),
  ];

  return {
    info: makeInfo({ transactionCount: transactions.length }),
    dashboard: makeDashboard(),
    dashboardPrevious: makeDashboard({
      totalExpenseCents: 100_000,
      totalIncomeCents: 400_000,
      netExpenseCents: 95_000,
      refundCents: 5_000,
    }),
    transactions,
    batches: [makeBatch()],
    rules: [makeRule()],
    range: { start: '2026-10-01', end: '2026-10-31' },
    setRange: vi.fn() as unknown as ExpenseLensValue['setRange'],
    dashboardSource: 'all',
    setDashboardSource: vi.fn() as unknown as ExpenseLensValue['setDashboardSource'],
    dashboardCategory: 'all',
    setDashboardCategory: vi.fn() as unknown as ExpenseLensValue['setDashboardCategory'],
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    notice: null,
    drafts: [],
    setDrafts: vi.fn() as unknown as ExpenseLensValue['setDrafts'],
    busy: false,
    stage: 'idle',
    parseFailures: [],
    lastImport: null,
    importError: null,
    restoreMode: 'merge',
    setRestoreMode: vi.fn() as unknown as ExpenseLensValue['setRestoreMode'],
    refresh: vi.fn(async () => undefined),
    loadMore: vi.fn(async () => undefined),
    handleFiles: vi.fn(async () => undefined),
    changeMapping: vi.fn(async () => undefined),
    duplicateStats: () => ({ certain: 0, suspected: [] }),
    confirmImport: vi.fn(async () => undefined),
    updateRecord: vi.fn(async () => true),
    undoBatch: vi.fn(async () => undefined),
    saveCategoryRule: vi.fn(async () => true),
    deleteCategoryRule: vi.fn(async () => true),
    backup: vi.fn(async () => undefined),
    exportJson: vi.fn(async () => undefined),
    exportCsv: vi.fn(async () => undefined),
    restore: vi.fn(async () => undefined),
    moveDatabase: vi.fn(async () => undefined),
    clearAll: vi.fn(async () => undefined),
    ...overrides,
  };
}
