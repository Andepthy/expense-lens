import { describe, expect, it, vi } from 'vitest';
import { renderWithLens } from '../test/render';
import { makeDashboard, makeInfo, makeTransaction } from '../test/lens';
import { clickHost, fireDetail, queryField } from '../test/materialEvents';
import { DashboardPage } from './DashboardPage';

const transactions = [
  makeTransaction(),
  makeTransaction({
    id: 'tx-pending',
    kind: 'pending',
    category: '待确认',
    merchant: '张三',
    included: false,
    exclusionReason: '待人工确认转账性质',
    amountCents: 20_000,
  }),
];

function renderDashboard(overrides = {}) {
  const onOpenTransactions = vi.fn();
  const onOpenImports = vi.fn();
  const view = renderWithLens(
    <DashboardPage onOpenTransactions={onOpenTransactions} onOpenImports={onOpenImports} />,
    { dashboard: makeDashboard(), transactions, ...overrides },
  );
  return { ...view, onOpenTransactions, onOpenImports };
}

describe('DashboardPage', () => {
  it('renders the actual dashboard metrics, pending notice and recent transactions', () => {
    renderDashboard();

    expect(screenText('¥1,234.00')).toBeGreaterThan(0);
    expect(screenText('¥5,000.00')).toBeGreaterThan(0);
    expect(screenText('¥1,184.00')).toBeGreaterThan(0);
    expect(screenText('2 笔交易待处理')).toBe(1);
    expect(screenText('星巴克')).toBeGreaterThan(0);
    expect(document.querySelector('table caption')?.textContent).toContain('收支趋势数据');
  });

  it('applies the date and source filters through the shared hook setters', () => {
    const { container, lens } = renderDashboard();
    fireDetail(queryField(container, '开始日期'), 'input', { value: '2026-10-05' });
    clickHost(screenButton('应用筛选'));

    expect(lens.setRange).toHaveBeenCalledWith({ start: '2026-10-05', end: '2026-10-31' });
    expect(lens.setDashboardSource).toHaveBeenCalledWith('all');
    expect(lens.setDashboardCategory).toHaveBeenCalledWith('all');
  });

  it('sends the pending shortcut to the transactions page with its filter intent', () => {
    const { onOpenTransactions } = renderDashboard();
    clickHost(screenButton('查看待处理'));
    expect(onOpenTransactions).toHaveBeenCalledWith('pending');
  });

  it('shows the first-run empty state instead of fake sample amounts', () => {
    const { onOpenImports } = renderDashboard({
      info: makeInfo({ transactionCount: 0 }),
      dashboard: makeDashboard({
        totalExpenseCents: 0,
        totalIncomeCents: 0,
        netExpenseCents: 0,
        refundCents: 0,
        transactionCount: 0,
        pendingCount: 0,
        categoryTotals: [],
        dailyTotals: [],
        merchantTotals: [],
        monthlyTotals: [],
      }),
      transactions: [],
    });

    expect(screenText('还没有交易数据')).toBe(1);
    expect(screenText('¥0.00')).toBe(0);
    clickHost(screenButton('去导入账单'));
    expect(onOpenImports).toHaveBeenCalledTimes(1);
  });

  it('renders loading and error states', () => {
    const { unmount } = renderWithLens(
      <DashboardPage onOpenTransactions={vi.fn()} onOpenImports={vi.fn()} />,
      { dashboard: null, loading: true },
    );
    expect(screenText('正在加载本地数据…')).toBe(1);
    unmount();

    renderWithLens(<DashboardPage onOpenTransactions={vi.fn()} onOpenImports={vi.fn()} />, {
      dashboard: null,
      loading: false,
      error: '数据库不可用',
    });
    expect(screenText('无法读取本地数据')).toBe(1);
    expect(screenText('数据库不可用')).toBe(1);
  });
});

function screenText(text: string): number {
  return [...document.querySelectorAll('body *')].filter(
    (element) => element.children.length === 0 && element.textContent?.trim() === text,
  ).length;
}

function screenButton(text: string): Element {
  const matches = [...document.querySelectorAll('m-button')].filter(
    (element) => element.textContent?.trim() === text,
  );
  const target = matches[0];
  if (!target) throw new Error(`button not found: ${text}`);
  return target;
}
