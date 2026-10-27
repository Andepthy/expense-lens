import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithLens } from '../test/render';
import { makeInfo, makeTransaction } from '../test/lens';
import { clickHost, fireDetail, queryField, querySelect } from '../test/materialEvents';
import { TransactionsPage } from './TransactionsPage';

const transactions = [
  makeTransaction(),
  makeTransaction({
    id: 'tx-income',
    platformId: 'wechat-2',
    occurredAt: '2026-10-20T09:00:00',
    amountCents: 500_000,
    kind: 'income',
    direction: '收入',
    merchant: '模拟公司',
    description: '工资',
    category: '收入',
    status: '已入账',
    fingerprint: 'fp-income',
  }),
  makeTransaction({
    id: 'tx-pending',
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
    fingerprint: 'fp-pending',
  }),
];

function renderTransactions(overrides = {}, initialKind: 'all' | 'expense' | 'income' | 'pending' = 'all') {
  return renderWithLens(
    <TransactionsPage initialKind={initialKind} onOpenImports={vi.fn()} />,
    { transactions, ...overrides },
  );
}

function rowCount(container: ParentNode): number {
  return container.querySelectorAll('tbody tr').length;
}

describe('TransactionsPage', () => {
  it('renders every transaction and distinguishes excluded records', () => {
    const { container } = renderTransactions();
    expect(rowCount(container)).toBe(3);
    expect(document.body.textContent).toContain('星巴克');
    expect(document.body.textContent).toContain('模拟公司');
    expect(document.body.textContent).toContain('待确认');
    expect(document.body.textContent).toContain('不计入统计');
  });

  it('filters by search text and by kind select', () => {
    const { container } = renderTransactions();
    fireDetail(queryField(container, '搜索'), 'input', { value: '星巴克' });
    expect(rowCount(container)).toBe(1);
    expect(document.body.textContent).toContain('星巴克');
    expect(document.body.textContent).not.toContain('模拟公司');

    fireDetail(queryField(container, '搜索'), 'input', { value: '' });
    fireDetail(querySelect(container, '收支类型'), 'change', { value: 'income' });
    expect(rowCount(container)).toBe(1);
    expect(document.body.textContent).toContain('模拟公司');
  });

  it('filters excluded transactions with the checkbox state', () => {
    const { container } = renderTransactions();
    const checkbox = container.querySelector('m-checkbox');
    expect(checkbox).not.toBeNull();
    fireDetail(checkbox!, 'change', { checked: true });
    expect(rowCount(container)).toBe(1);
    expect(document.body.textContent).toContain('张三');
  });

  it('sorts by amount both directions', () => {
    const { container } = renderTransactions();
    const amountSort = [...container.querySelectorAll('button.sort-button')].find(
      (button) => button.textContent?.trim() === '金额↕',
    );
    expect(amountSort).toBeDefined();
    fireEvent.click(amountSort!);
    let firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('模拟公司');

    fireEvent.click(amountSort!);
    firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('星巴克');
  });

  it('opens the edit dialog and persists the latest typed category', async () => {
    const { container, lens } = renderTransactions();
    const edit = container.querySelector('m-button[aria-label^="编辑交易"]');
    expect(edit).not.toBeNull();
    clickHost(edit!);

    const dialog = document.querySelector('m-dialog[headline="编辑交易"]');
    expect(dialog).not.toBeNull();
    const category = dialog!.querySelector('m-text-field[label="分类"]');
    expect(category).not.toBeNull();
    fireDetail(category!, 'input', { value: '咖啡与茶' });

    const save = [...dialog!.querySelectorAll('m-button')].find(
      (button) => button.textContent?.trim() === '保存',
    );
    expect(save).toBeDefined();
    clickHost(save!);

    expect(lens.updateRecord).toHaveBeenCalledWith('tx-1', {
      category: '咖啡与茶',
      kind: 'expense',
      included: true,
    });
  });

  it('distinguishes no results from the first-run empty state and resets filters', () => {
    const { container } = renderTransactions();
    fireDetail(queryField(container, '搜索'), 'input', { value: '不存在' });
    expect(document.body.textContent).toContain('没有匹配的交易');
    clickHost([...document.querySelectorAll('m-button')].find((button) => button.textContent?.trim() === '清除筛选')!);
    expect(rowCount(container)).toBe(3);
  });

  it('loads more rows through the shared hook', () => {
    const { lens } = renderTransactions({ info: makeInfo({ transactionCount: 600 }) });
    const loadMore = [...document.querySelectorAll('m-button')].find(
      (button) => button.textContent?.trim() === '加载更多',
    );
    expect(loadMore).toBeDefined();
    clickHost(loadMore!);
    expect(lens.loadMore).toHaveBeenCalledTimes(1);
  });

  it('honours the initial kind intent from the dashboard', () => {
    const { container } = renderTransactions({}, 'income');
    expect(rowCount(container)).toBe(1);
    expect(document.body.textContent).toContain('模拟公司');
  });
});
