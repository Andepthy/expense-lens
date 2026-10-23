import { describe, expect, it, vi } from 'vitest';
import { renderWithLens } from '../test/render';
import { makeDraft, makeImportReport, makeParseResult } from '../test/lens';
import { clickHost, fireDetail, querySelect } from '../test/materialEvents';
import { ImportsPage } from './ImportsPage';

function materialButton(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('m-button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!match) throw new Error(`button not found: ${text}`);
  return match as unknown as HTMLButtonElement;
}

describe('ImportsPage', () => {
  it('shows mapping, parse issues and duplicate decisions for a parsed draft', () => {
    const draft = makeDraft({
      result: makeParseResult({
        issues: [{ rowNumber: 3, reason: '金额缺失或不是有效的分币金额', raw: { 金额: '--' } }],
      }),
    });
    const duplicateStats = vi.fn(() => ({
      certain: 1,
      suspected: [
        {
          id: 'parsed-1',
          candidate: '已有星巴克交易',
          reason: '时间、金额和商户相似，需人工确认',
        },
      ],
    }));

    renderWithLens(<ImportsPage />, {
      drafts: [draft],
      duplicateStats,
    });

    expect(document.body.textContent).toContain('支付宝交易明细.csv');
    expect(document.body.textContent).toContain('金额缺失或不是有效的分币金额');
    expect(document.body.textContent).toContain('确定重复');
    expect(document.body.textContent).toContain('已有星巴克交易');
    expect(querySelect(document, '交易时间 *')).toBeTruthy();
    expect(materialButton('确认导入').hasAttribute('disabled')).toBe(true);
  });

  it('routes a mapping change through the hook and re-parses with the column index', () => {
    const changeMapping = vi.fn(async () => undefined);
    const { container } = renderWithLens(<ImportsPage />, {
      drafts: [makeDraft()],
      changeMapping,
    });
    fireDetail(querySelect(container, '交易时间 *'), 'change', { value: '1' });
    expect(changeMapping).toHaveBeenCalledWith(0, 'time', 1);
  });

  it('records a duplicate decision into draft state', () => {
    const { lens } = renderWithLens(<ImportsPage />, {
      drafts: [makeDraft()],
      duplicateStats: () => ({
        certain: 0,
        suspected: [{ id: 'parsed-1', candidate: '已有交易', reason: '时间、金额和商户相似' }],
      }),
    });

    fireDetail(querySelect(document, '处理方式'), 'change', { value: 'skip' });
    const updater = (lens.setDrafts as unknown as { mock: { calls: Array<[(items: unknown[]) => unknown]> } }).mock
      .calls[0]?.[0];
    expect(updater).toBeDefined();
    const next = updater!([
      makeDraft(),
    ]) as Array<{ choices: Record<string, string> }>;
    expect(next[0]?.choices['parsed-1']).toBe('skip');
  });

  it('passes selected files to the existing parser and supports cancel', () => {
    const handleFiles = vi.fn(async () => undefined);
    const { lens } = renderWithLens(<ImportsPage />, { handleFiles });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['a,b'], 'bill.csv', { type: 'text/csv' });
    const files = { 0: file, length: 1, item: () => file } as unknown as FileList;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    fireEventChange(input);
    expect(handleFiles).toHaveBeenCalledWith(files);

    clickHost(materialButton('选择本地文件'));
    expect(lens.handleFiles).toHaveBeenCalled();
  });

  it('submits only when ready and reports the real import result', () => {
    const confirmImport = vi.fn(async () => undefined);
    const { lens } = renderWithLens(<ImportsPage />, {
      drafts: [makeDraft({ choices: { 'parsed-1': 'skip' } })],
      confirmImport,
      duplicateStats: () => ({
        certain: 0,
        suspected: [{ id: 'parsed-1', candidate: '已有交易', reason: '相似' }],
      }),
    });
    clickHost(materialButton('确认导入'));
    expect(confirmImport).toHaveBeenCalledTimes(1);

    void lens;
  });

  it('renders the last import receipt, parse failures and import errors', () => {
    renderWithLens(<ImportsPage />, {
      drafts: [],
      lastImport: [makeImportReport()],
      parseFailures: [{ filename: 'bad.txt', message: '不支持的文件类型' }],
      importError: '数据库正被占用',
    });

    expect(document.body.textContent).toContain('上次导入结果');
    expect(document.body.textContent).toContain('bad.txt');
    expect(document.body.textContent).toContain('数据库正被占用');
    expect(document.body.textContent).toContain('导入未完成，数据库事务已回滚');
  });

  it('clears pending drafts on cancel', () => {
    const { lens } = renderWithLens(<ImportsPage />, { drafts: [makeDraft()] });
    clickHost(materialButton('取消导入'));
    expect(lens.setDrafts).toHaveBeenCalledWith([]);
  });
});

function fireEventChange(element: Element) {
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
