import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithLens } from '../test/render';
import { makeBatch, makeInfo, makeTransaction } from '../test/lens';
import { clickHost, fireDetail, queryField, querySelect } from '../test/materialEvents';
import { DataPage } from './DataPage';

function materialButton(text: string): Element {
  const match = [...document.querySelectorAll('m-button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

function renderData(overrides = {}) {
  return renderWithLens(<DataPage onOpenImports={vi.fn()} />, {
    info: makeInfo(),
    batches: [makeBatch()],
    transactions: [makeTransaction()],
    ...overrides,
  });
}

describe('DataPage', () => {
  it('renders the local database status and import batch archive', () => {
    renderData();
    expect(document.body.textContent).toContain('expenses.db');
    expect(document.body.textContent).toContain('2.4 MB');
    expect(document.body.textContent).toContain('微信支付账单.xlsx');
    expect(document.body.textContent).toContain('撤销批次');
  });

  it('connects backup, JSON export and CSV export to the hook', () => {
    const { lens } = renderData();
    clickHost(materialButton('备份数据库'));
    clickHost(materialButton('导出完整 JSON'));
    clickHost(materialButton('导出 CSV'));

    expect(lens.backup).toHaveBeenCalledTimes(1);
    expect(lens.exportJson).toHaveBeenCalledTimes(1);
    expect(lens.exportCsv).toHaveBeenCalledWith({
      start: '2026-10-01',
      end: '2026-10-31',
      source: 'all',
      category: 'all',
      kind: 'all',
    });
  });

  it('validates the export date range before enabling CSV export', () => {
    const { container } = renderData();
    fireDetail(queryField(container, '开始日期'), 'input', { value: '2026-11-01' });
    expect(materialButton('导出 CSV').hasAttribute('disabled')).toBe(true);
  });

  it('switches restore mode and calls the existing restore flow', () => {
    const { lens } = renderData();
    fireDetail(querySelect(document, '恢复方式'), 'change', { value: 'replace' });
    expect(lens.setRestoreMode).toHaveBeenCalledWith('replace');
    clickHost(materialButton('选择备份并恢复'));
    expect(lens.restore).toHaveBeenCalledTimes(1);
  });

  it('confirms an import batch undo before calling the hook', async () => {
    const { lens, confirm } = renderData();
    clickHost(materialButton('撤销批次'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lens.undoBatch).toHaveBeenCalledWith('batch-1'));
  });

  it('routes destructive clear through the hook-owned double confirmation', () => {
    const { lens } = renderData();
    clickHost(materialButton('清空数据'));
    expect(lens.clearAll).toHaveBeenCalledTimes(1);
  });

  it('shows an empty batch archive', () => {
    renderData({ batches: [] });
    expect(document.body.textContent).toContain('还没有导入批次');
  });
});
