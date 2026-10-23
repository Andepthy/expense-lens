import { useCallback, useEffect, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { api } from '../lib/api';
import { detectDuplicate } from '../domain/deduplicate';
import type { CategoryRule, DashboardData, DatabaseInfo, ImportBatch, ParseResult, Transaction } from '../types';

type Draft = { file: File; result: ParseResult; choices: Record<string, 'new' | 'skip'> };
type DateRange = { start: string; end: string };
type Notice = { message: string; tone: 'success' | 'error' };
type DuplicateStats = { certain: number; suspected: { id: string; candidate: string; reason: string }[] };
type RestoreMode = 'merge' | 'replace';

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function currentMonth(): DateRange {
  const now = new Date();
  return { start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

/** Business workflows shared by the minimal shell and the future presentation layer. */
export function useExpenseLens() {
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardPrevious, setDashboardPrevious] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [range, setRange] = useState<DateRange>(currentMonth);
  const [dashboardSource, setDashboardSource] = useState('all');
  const [dashboardCategory, setDashboardCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');

  const notify = useCallback((message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone }), []);
  const refresh = useCallback(async () => {
    try {
      const startDate = new Date(`${range.start}T00:00:00`);
      const endDate = new Date(`${range.end}T00:00:00`);
      const periodDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
      const previousEnd = new Date(startDate.getTime() - 86400000);
      const previousStart = new Date(startDate.getTime() - periodDays * 86400000);
      const [db, rows, stats, previous, history, categoryRules] = await Promise.all([
        api.databaseInfo(), api.transactions(500, 0),
        api.dashboard(range.start, range.end, dashboardSource, dashboardCategory),
        api.dashboard(localDate(previousStart), localDate(previousEnd), dashboardSource, dashboardCategory),
        api.batches(), api.categoryRules(),
      ]);
      setInfo(db); setTransactions(rows); setDashboard(stats); setDashboardPrevious(previous); setBatches(history); setRules(categoryRules);
    } catch (error) {
      notify(String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [range, dashboardSource, dashboardCategory, notify]);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = async () => {
    if (!info || transactions.length >= info.transactionCount) return;
    try {
      const next = await api.transactions(500, transactions.length);
      setTransactions((current) => [...current, ...next]);
    } catch (error) { notify(String(error), 'error'); }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const selectedFiles = Array.from(files);
    setBusy(true);
    try {
      const { parseBill } = await import('../importers/parse');
      const next: Draft[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        try { next.push({ file, result: await parseBill(file), choices: {} }); }
        catch (error) { failures.push(`${file.name}：${String(error)}`); }
      }
      setDrafts(next);
      if (failures.length) notify(failures.length === 1 ? (failures[0] ?? '账单解析失败。') : `${failures.length} 个文件解析失败：${failures.slice(0, 3).join('；')}`, 'error');
      else if (!next.length) notify('没有文件解析成功。请确认选择的是微信 XLSX 或支付宝 CSV 账单。', 'error');
    } catch (error) {
      setDrafts([]); notify(`无法加载账单解析器：${String(error)}`, 'error');
    } finally { setBusy(false); }
  };

  const changeMapping = async (index: number, field: string, column: number) => {
    const old = drafts[index];
    if (!old) return;
    const mapping = { ...old.result.mapping };
    if (column < 0) delete mapping[field]; else mapping[field] = column;
    try {
      const { parseBill } = await import('../importers/parse');
      const result = await parseBill(old.file, mapping);
      setDrafts((items) => items.map((item, i) => i === index ? { ...item, result } : item));
    } catch (error) { notify(String(error), 'error'); }
  };

  const duplicateStats = (result: ParseResult): DuplicateStats => result.parsed.reduce((acc, row) => {
    const match = detectDuplicate(row.transaction, transactions);
    if (match.status === 'certain') acc.certain++;
    else if (match.status === 'suspected') acc.suspected.push({ id: row.transaction.id, candidate: match.candidate?.merchant ?? '已有交易', reason: match.reason ?? '疑似重复' });
    return acc;
  }, { certain: 0, suspected: [] as DuplicateStats['suspected'] });

  const confirmImport = async () => {
    const ready = drafts.filter((draft) => !draft.result.mappingNeeded);
    if (!ready.length) { notify('请先完成必需字段映射。', 'error'); return; }
    if (ready.some((draft) => duplicateStats(draft.result).suspected.some((match) => !draft.choices[match.id]))) { notify('请先逐条处理疑似重复记录。', 'error'); return; }
    setBusy(true);
    let duplicates = 0;
    try {
      const files = ready.map((draft) => {
        const duplicateDecisions = draft.result.parsed.flatMap(({ transaction }) => {
          const match = detectDuplicate(transaction, transactions);
          if (match.status !== 'suspected' || !draft.choices[transaction.id]) return [];
          return [{ candidateId: match.candidate?.id ?? null, incomingJson: transaction.rawJson, certainty: 'suspected', reason: match.reason ?? '时间、金额与商户相似', decision: draft.choices[transaction.id] === 'skip' ? 'skipped' : 'kept_separate' }];
        });
        const importedTransactions = draft.result.parsed.filter(({ transaction }) => {
          const match = detectDuplicate(transaction, transactions);
          return match.status !== 'suspected' || draft.choices[transaction.id] === 'new';
        }).map((item) => item.transaction);
        duplicates += draft.result.parsed.filter(({ transaction }) => draft.choices[transaction.id] === 'skip').length;
        return { filename: draft.result.filename, source: draft.result.source, transactions: importedTransactions, duplicateDecisions };
      });
      const results = await api.importFiles(files);
      duplicates += results.reduce((sum, result) => sum + result.duplicates, 0);
      setDrafts([]); await refresh();
      notify(`导入完成：新增 ${results.reduce((sum, result) => sum + result.added, 0)} 笔，跳过重复 ${duplicates} 笔。`);
    } catch (error) {
      notify(`导入未完成，数据库事务已回滚：${String(error)}`, 'error'); await refresh();
    } finally { setBusy(false); }
  };

  const updateRecord = async (id: string, update: Partial<Pick<Transaction, 'category' | 'kind' | 'included'>>) => {
    const current = transactions.find((transaction) => transaction.id === id);
    if (!current) return;
    const merged = { category: update.category ?? current.category, kind: update.kind ?? current.kind, included: update.included ?? current.included };
    try { await api.updateTransaction(id, merged); await refresh(); notify('交易已更新。'); }
    catch (error) { notify(String(error), 'error'); }
  };
  const undoBatch = async (id: string) => {
    try { await api.undoBatch(id); await refresh(); notify('该批次新增记录已撤销。'); }
    catch (error) { notify(String(error), 'error'); }
  };

  const saveCategoryRule = async (input: { name: string; pattern: string; category: string; enabled: boolean }) => {
    try { await api.saveCategoryRule(input); await refresh(); notify('自定义规则已保存，后续导入将应用此规则。'); }
    catch (error) { notify(String(error), 'error'); }
  };
  const deleteCategoryRule = async (id: string) => {
    try { await api.deleteCategoryRule(id); await refresh(); notify('分类规则已删除。'); }
    catch (error) { notify(String(error), 'error'); }
  };
  const savePath = (title: string, defaultName: string, extensions: string[]) => save({ title, defaultPath: defaultName, filters: [{ name: '文件', extensions }] });
  const backup = async () => {
    const path = await savePath('备份 SQLite 数据库', 'expenses-backup.db', ['db']);
    if (!path) return;
    try { await api.backup(path); notify('数据库备份已保存。'); } catch (error) { notify(String(error), 'error'); }
  };
  const exportJson = async () => {
    const path = await savePath('导出 JSON 数据备份', 'expenses-backup.json', ['json']);
    if (!path) return;
    try { await api.exportJson(path); notify('JSON 数据备份已导出。'); } catch (error) { notify(String(error), 'error'); }
  };
  const exportCsv = async (filters: { start?: string; end?: string; source?: string; category?: string; kind?: string } = {}) => {
    const path = await savePath('导出交易 CSV', 'expenses.csv', ['csv']);
    if (!path) return;
    try {
      await api.exportCsv(path, filters.start ?? range.start, filters.end ?? range.end, filters.source ?? 'all', filters.category ?? 'all', filters.kind ?? 'all');
      notify('筛选范围内的 CSV 已导出。');
    } catch (error) { notify(String(error), 'error'); }
  };
  const restore = async (mode: RestoreMode = restoreMode) => {
    const selectedPath = await open({ title: '选择数据库或 JSON 备份', multiple: false, filters: [{ name: '备份文件', extensions: ['db', 'sqlite', 'sqlite3', 'json'] }] });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const isJson = selectedPath.toLowerCase().endsWith('.json');
    const accepted = window.confirm(mode === 'replace' ? '将完整替换当前数据库中的所有数据。请确认已有备份后继续。' : '将合并备份数据；冲突时保留当前记录。是否继续？');
    if (!accepted) return;
    try {
      const result = isJson ? await api.restoreJson(selectedPath, mode) : await api.restore(selectedPath, mode);
      await refresh(); notify(`恢复完成：新增 ${result.inserted} 笔${result.conflicts ? `，冲突 ${result.conflicts} 笔保留现有数据` : ''}。`);
    } catch (error) { notify(String(error), 'error'); }
  };
  const moveDatabase = async () => {
    const path = await savePath('选择新数据库文件位置', 'expenses.db', ['db']);
    if (!path || !window.confirm('应用将使用备份 API 将当前数据库迁移到新位置。迁移成功后原数据库文件仍保留。继续吗？')) return;
    try { setInfo(await api.migrate(path)); await refresh(); notify('数据库已迁移，原文件保留。'); }
    catch (error) { notify(String(error), 'error'); }
  };
  const clearAll = async () => {
    if (!window.confirm('清空交易、导入历史和自定义规则？此操作无法撤销。') || !window.confirm('再次确认清空数据？')) return;
    try { await api.clear(); await refresh(); notify('数据已清空。'); }
    catch (error) { notify(String(error), 'error'); }
  };

  return {
    info, dashboard, dashboardPrevious, transactions, batches, rules, range, setRange,
    dashboardSource, setDashboardSource, dashboardCategory, setDashboardCategory,
    loading, notice, drafts, setDrafts, busy, restoreMode, setRestoreMode,
    refresh, loadMore, handleFiles, changeMapping, duplicateStats, confirmImport,
    updateRecord, undoBatch, saveCategoryRule, deleteCategoryRule, backup, exportJson, exportCsv, restore, moveDatabase, clearAll,
  };
}

