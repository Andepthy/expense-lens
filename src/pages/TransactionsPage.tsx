import { useEffect, useMemo, useState } from 'react';
import { Button } from 'material/react';
import { ReceiptText, Search, Upload } from 'lucide-react';
import { useLens } from '../app/ExpenseLensProvider';
import { PageHeader, SectionCard } from '../components/layout';
import { CheckboxInput, SelectField, TextFieldInput } from '../components/inputs';
import { EmptyState, PageError, PageLoading } from '../components/states';
import { TransactionTable, type SortKey, type SortState } from '../components/TransactionTable';
import { TransactionEditDialog, type TransactionUpdateInput } from '../components/TransactionEditDialog';
import { iconMarkup } from '../components/iconMarkup';
import {
  categoryOptions,
  EXPENSE_CATEGORIES,
  KIND_OPTIONS,
  SOURCE_OPTIONS,
  SYSTEM_CATEGORIES,
} from '../domain/labels';
import { formatCount } from '../lib/format';
import type { Source, Transaction, TransactionKind } from '../types';
import { isValidRange } from '../lib/dateRange';

interface TransactionsPageProps {
  initialKind: TransactionKind | 'all';
  onOpenImports: () => void;
}

export function TransactionsPage({ initialKind, onOpenImports }: TransactionsPageProps) {
  const lens = useLens();
  const {
    transactions,
    info,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
    updateRecord,
  } = lens;

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<TransactionKind | 'all'>(initialKind);
  const [source, setSource] = useState<Source | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [excludedOnly, setExcludedOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'occurredAt', direction: 'desc' });
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);

  const categories = useMemo(
    () => categoryOptions(EXPENSE_CATEGORIES, SYSTEM_CATEGORIES, transactions.map((tx) => tx.category)),
    [transactions],
  );

  const invalidRange = Boolean(start && end && !isValidRange(start, end));
  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (kind !== 'all' && tx.kind !== kind) return false;
      if (source !== 'all' && tx.source !== source) return false;
      if (category !== 'all' && tx.category !== category) return false;
      if (excludedOnly && tx.included) return false;
      const day = tx.occurredAt.slice(0, 10);
      if (start && day < start) return false;
      if (end && day > end) return false;
      if (query) {
        const haystack = [
          tx.merchant,
          tx.description,
          tx.category,
          tx.rawCategory,
          tx.status,
          tx.paymentMethod,
          tx.direction,
          tx.platformId ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [transactions, kind, source, category, excludedOnly, start, end, query]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((left, right) => {
      let result: number;
      if (sort.key === 'amountCents') result = left.amountCents - right.amountCents;
      else if (sort.key === 'merchant') result = left.merchant.localeCompare(right.merchant, 'zh-CN');
      else result = left.occurredAt.localeCompare(right.occurredAt);
      return sort.direction === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort]);

  const hasFilters = Boolean(
    search || kind !== 'all' || source !== 'all' || category !== 'all' || start || end || excludedOnly,
  );

  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'merchant' ? 'asc' : 'desc' };
    });
  };

  const resetFilters = () => {
    setSearch('');
    setKind('all');
    setSource('all');
    setCategory('all');
    setStart('');
    setEnd('');
    setExcludedOnly(false);
  };

  const saveEdit = (id: string, update: TransactionUpdateInput) => updateRecord(id, update);

  const totalCount = info?.transactionCount ?? transactions.length;
  const canLoadMore = info ? transactions.length < info.transactionCount : false;

  if (loading && transactions.length === 0) return <PageLoading label="正在加载交易明细…" />;

  if (error && transactions.length === 0) {
    return (
      <div className="page">
        <PageHeader title="交易明细" description="在本地搜索、筛选并修正交易记录。" />
        <PageError message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="交易明细"
        description="在本地搜索、筛选并修正交易记录，金额与状态沿用现有统计口径。"
        actions={
          <Button icon={iconMarkup(Upload, 18)} variant="outlined" onClick={onOpenImports}>
            导入更多账单
          </Button>
        }
      />

      <div className="filter-bar" role="group" aria-label="交易筛选">
        <TextFieldInput
          label="搜索"
          value={search}
          onValueChange={setSearch}
          leadingIcon={iconMarkup(Search, 20)}
          className="filter-field--wide"
        />
        <SelectField
          label="收支类型"
          value={kind}
          options={[{ value: 'all', label: '全部类型' }, ...KIND_OPTIONS]}
          onValueChange={(value) => setKind(value as TransactionKind | 'all')}
        />
        <SelectField
          label="支付平台"
          value={source}
          options={[{ value: 'all', label: '全部平台' }, ...SOURCE_OPTIONS]}
          onValueChange={(value) => setSource(value as Source | 'all')}
        />
        <SelectField
          label="分类"
          value={category}
          options={[
            { value: 'all', label: '全部分类' },
            ...categories.map((value) => ({ value, label: value })),
          ]}
          onValueChange={setCategory}
        />
        <TextFieldInput
          label="开始日期"
          type="date"
          value={start}
          onValueChange={setStart}
          error={invalidRange}
        />
        <TextFieldInput
          label="结束日期"
          type="date"
          value={end}
          onValueChange={setEnd}
          error={invalidRange}
          supportingText={invalidRange ? '结束日期不能早于开始日期' : undefined}
        />
        <div className="filter-check">
          <CheckboxInput
            label="仅看未计入统计"
            checked={excludedOnly}
            onCheckedChange={setExcludedOnly}
          />
        </div>
        <div className="filter-actions">
          <Button variant="outlined" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
          <Button variant="text" onClick={resetFilters} disabled={!hasFilters}>
            清除筛选
          </Button>
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="还没有交易"
          description="导入微信支付 XLSX 或支付宝 CSV 账单后，交易会按时间顺序出现在这里。账单文件只在本机读取。"
          action={
            <Button variant="filled" onClick={onOpenImports}>
              去导入账单
            </Button>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="没有匹配的交易"
          description="当前搜索或筛选条件下没有结果。清除筛选即可回到完整列表。"
          action={
            <Button variant="outlined" onClick={resetFilters}>
              清除筛选
            </Button>
          }
        />
      ) : (
        <SectionCard
          title="交易列表"
          subtitle="金额按交易类型显示正负号；未计入统计的记录会标记原因。"
          action={
            <div className="btn-row">
              <Button variant="text" onClick={() => void loadMore()} disabled={!canLoadMore || loadingMore}>
                {loadingMore ? '加载中…' : canLoadMore ? '加载更多' : '已加载全部'}
              </Button>
            </div>
          }
        >
          <div className="table-toolbar">
            <span className="table-meta">
              已加载 {formatCount(transactions.length)} / 共 {formatCount(totalCount)} 笔
              {hasFilters ? ` · 筛选后 ${formatCount(sorted.length)} 笔` : ''}
            </span>
          </div>
          <TransactionTable
            transactions={sorted}
            sort={sort}
            onSort={handleSort}
            onEdit={(transaction) => setEditing(transaction)}
          />
        </SectionCard>
      )}

      <TransactionEditDialog
        transaction={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </div>
  );
}
