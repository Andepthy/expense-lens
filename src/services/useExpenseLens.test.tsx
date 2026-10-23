import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeBatch, makeDashboard, makeImportReport, makeInfo, makeParseResult, makeRule, makeTransaction } from '../test/lens';

const apiMock = vi.hoisted(() => ({
  databaseInfo: vi.fn(),
  transactions: vi.fn(),
  dashboard: vi.fn(),
  batches: vi.fn(),
  categoryRules: vi.fn(),
  saveCategoryRule: vi.fn(),
  deleteCategoryRule: vi.fn(),
  importFiles: vi.fn(),
  updateTransaction: vi.fn(),
  undoBatch: vi.fn(),
  backup: vi.fn(),
  restore: vi.fn(),
  restoreJson: vi.fn(),
  migrate: vi.fn(),
  exportJson: vi.fn(),
  exportCsv: vi.fn(),
  clear: vi.fn(),
}));

const parseBillMock = vi.hoisted(() => vi.fn());
const dialogMock = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../importers/parse', () => ({ parseBill: parseBillMock }));
vi.mock('@tauri-apps/plugin-dialog', () => dialogMock);

import { useExpenseLens } from './useExpenseLens';

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.databaseInfo.mockResolvedValue(makeInfo());
  apiMock.transactions.mockResolvedValue([makeTransaction()]);
  apiMock.dashboard.mockResolvedValue(makeDashboard());
  apiMock.batches.mockResolvedValue([makeBatch()]);
  apiMock.categoryRules.mockResolvedValue([makeRule()]);
  apiMock.importFiles.mockResolvedValue([makeImportReport()]);
  apiMock.saveCategoryRule.mockResolvedValue(makeRule());
  apiMock.deleteCategoryRule.mockResolvedValue(undefined);
  apiMock.clear.mockResolvedValue(undefined);
  apiMock.restore.mockResolvedValue({ inserted: 1, conflicts: 0, replaced: false });
  parseBillMock.mockResolvedValue(makeParseResult());
});

async function renderLens(confirmAccepted = true) {
  const confirm = vi.fn(async () => confirmAccepted);
  const view = renderHook(() => useExpenseLens({ confirm }));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return { ...view, confirm };
}

describe('useExpenseLens', () => {
  it('loads all shared state in one refresh and exposes the initial range', async () => {
    const { result } = await renderLens();
    expect(result.current.info?.transactionCount).toBe(3);
    expect(result.current.dashboard?.totalExpenseCents).toBe(123_400);
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.batches).toHaveLength(1);
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces refresh failures as an inline error and a notice', async () => {
    apiMock.databaseInfo.mockRejectedValueOnce(new Error('磁盘不可用'));
    const { result } = await renderLens();
    expect(result.current.error).toContain('磁盘不可用');
    expect(result.current.notice).toEqual({ message: 'Error: 磁盘不可用', tone: 'error' });
  });

  it('rejects unsupported file types without invoking the parser', async () => {
    const { result } = await renderLens();
    await act(async () => {
      await result.current.handleFiles(fileList(new File(['x'], 'notes.txt', { type: 'text/plain' })));
    });
    expect(parseBillMock).not.toHaveBeenCalled();
    expect(result.current.parseFailures).toEqual([
      { filename: 'notes.txt', message: '不支持的文件类型；仅支持 CSV 或 XLSX 账单。' },
    ]);
    expect(result.current.stage).toBe('idle');
  });

  it('keeps the latest input when a suspected duplicate is skipped and sends the decision', async () => {
    const duplicateResult = makeParseResult({
      source: 'wechat',
      filename: '微信账单.xlsx',
      parsed: [
        {
          transaction: makeTransaction({
            id: 'parsed-duplicate',
            platformId: null,
            fingerprint: 'different-fingerprint',
          }),
          rowNumber: 2,
        },
      ],
    });
    parseBillMock.mockResolvedValue(duplicateResult);
    const { result } = await renderLens();

    await act(async () => {
      await result.current.handleFiles(fileList(new File(['x'], '微信账单.xlsx')));
    });
    expect(result.current.drafts).toHaveLength(1);
    const draft = result.current.drafts[0]!;
    expect(result.current.duplicateStats(draft.result).suspected).toHaveLength(1);

    act(() => {
      result.current.setDrafts((items) =>
        items.map((item) => ({
          ...item,
          choices: { ...item.choices, 'parsed-duplicate': 'skip' as const },
        })),
      );
    });

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(apiMock.importFiles).toHaveBeenCalledTimes(1);
    const files = apiMock.importFiles.mock.calls[0]?.[0] as Array<{
      duplicateDecisions: Array<{ decision: string; candidateId: string | null }>;
      transactions: unknown[];
    }>;
    expect(files[0]?.duplicateDecisions[0]?.decision).toBe('skipped');
    expect(files[0]?.duplicateDecisions[0]?.candidateId).toBe('tx-1');
    expect(files[0]?.transactions).toHaveLength(0);
    expect(result.current.lastImport?.[0]?.added).toBe(10);
    expect(result.current.drafts).toHaveLength(0);
    expect(result.current.stage).toBe('idle');
  });

  it('passes the rule id through when editing or toggling a rule', async () => {
    apiMock.saveCategoryRule.mockResolvedValue(makeRule({ enabled: false }));
    const { result } = await renderLens();
    let ok = false;
    await act(async () => {
      ok = await result.current.saveCategoryRule({
        id: 'rule-1',
        name: '咖啡关键词',
        pattern: '星巴克',
        category: '餐饮',
        enabled: false,
      });
    });
    expect(ok).toBe(true);
    expect(apiMock.saveCategoryRule).toHaveBeenCalledWith({
      id: 'rule-1',
      name: '咖啡关键词',
      pattern: '星巴克',
      category: '餐饮',
      enabled: false,
    });
  });

  it('does not restore or clear when confirmation is declined', async () => {
    dialogMock.open.mockResolvedValue('C:\\backup.db');
    const { result, confirm } = await renderLens(false);
    await act(async () => {
      await result.current.restore('merge');
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(apiMock.restore).not.toHaveBeenCalled();

    const clear = await renderLens(false);
    await act(async () => {
      await clear.result.current.clearAll();
    });
    expect(apiMock.clear).not.toHaveBeenCalled();
  });
});

function fileList(...files: File[]): FileList {
  const list: Record<number, File> & { length: number; item: (index: number) => File | null } = {
    length: files.length,
    item: (index) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list as unknown as FileList;
}

