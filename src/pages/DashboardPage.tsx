import { useEffect, useMemo, useState } from 'react';
import { Button } from 'material/react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react';
import { useLens } from '../app/ExpenseLensProvider';
import { PageHeader, MetricCard, SectionCard } from '../components/layout';
import { iconMarkup } from '../components/iconMarkup';
import { SelectField, TextFieldInput } from '../components/inputs';
import { EmptyState, InlineAlert, PageError, PageLoading, StatusChip } from '../components/states';
import { TrendChart, type TrendPoint } from '../components/charts/TrendChart';
import { CategoryChart } from '../components/charts/CategoryChart';
import { MerchantRanking } from '../components/MerchantRanking';
import { categoryOptions, KIND_LABELS, KIND_TONES, SOURCE_LABELS, SOURCE_OPTIONS, EXPENSE_CATEGORIES, SYSTEM_CATEGORIES } from '../domain/labels';
import type { Transaction, TransactionKind } from '../types';
import { currentMonthRange, isValidRange } from '../lib/dateRange';
import {
  formatCount,
  formatDate,
  formatDay,
  formatDelta,
  formatMoney,
  formatMonth,
  formatTime,
  formatTransactionAmount,
} from '../lib/format';

interface DashboardPageProps {
  onOpenTransactions: (kind: TransactionKind | 'all') => void;
  onOpenImports: () => void;
}

export function DashboardPage({ onOpenTransactions, onOpenImports }: DashboardPageProps) {
  const lens = useLens();
  const {
    dashboard,
    dashboardPrevious,
    range,
    dashboardSource,
    dashboardCategory,
    transactions,
    info,
    loading,
    refreshing,
    error,
    refresh,
    setRange,
    setDashboardSource,
    setDashboardCategory,
  } = lens;

  const [draft, setDraft] = useState({
    start: range.start,
    end: range.end,
    source: dashboardSource,
    category: dashboardCategory,
  });

  useEffect(() => {
    setDraft({
      start: range.start,
      end: range.end,
      source: dashboardSource,
      category: dashboardCategory,
    });
  }, [range.start, range.end, dashboardSource, dashboardCategory]);

  const invalidRange = !isValidRange(draft.start, draft.end);
  const categories = useMemo(
    () =>
      categoryOptions(
        EXPENSE_CATEGORIES,
        SYSTEM_CATEGORIES,
        dashboard?.categoryTotals.map((item) => item.category),
        transactions.map((tx) => tx.category),
      ),
    [dashboard, transactions],
  );

  if (loading && !dashboard) return <PageLoading />;
  if (!dashboard) {
    return (
      <div className="page">
        <PageHeader title="概览" description="本期收支结构、趋势与需要留意的本地交易。" />
        <PageError message={error ?? '本地概览暂不可用，请重试。'} onRetry={() => void refresh()} />
      </div>
    );
  }

  const applyFilters = () => {
    if (invalidRange) return;
    setRange({ start: draft.start, end: draft.end });
    setDashboardSource(draft.source);
    setDashboardCategory(draft.category);
  };

  const resetFilters = () => {
    const month = currentMonthRange();
    setDraft({ start: month.start, end: month.end, source: 'all', category: 'all' });
    setRange(month);
    setDashboardSource('all');
    setDashboardCategory('all');
  };

  const hasAnyTransactions = (info?.transactionCount ?? 0) > 0;
  const isPeriodEmpty = dashboard.transactionCount === 0;
  const granularity: 'day' | 'month' = dashboard.dailyTotals.length > 62 ? 'month' : 'day';
  const trendPoints: TrendPoint[] =
    granularity === 'month'
      ? dashboard.monthlyTotals.map((item) => ({
          key: item.month,
          label: formatMonth(item.month),
          expenseCents: item.expenseCents,
          incomeCents: item.incomeCents,
        }))
      : dashboard.dailyTotals.map((item) => ({
          key: item.day,
          label: formatDay(item.day),
          expenseCents: item.expenseCents,
          incomeCents: item.incomeCents,
        }));

  const previous = dashboardPrevious;

  return (
    <div className="page">
      <PageHeader
        title="概览"
        description="本期收支结构、趋势与需要留意的本地交易。"
        actions={
          <Button icon={iconMarkup(Upload, 18)} variant="filled" onClick={onOpenImports}>
            导入账单
          </Button>
        }
      />

      <div className="filter-bar" role="group" aria-label="概览筛选">
        <TextFieldInput
          label="开始日期"
          type="date"
          value={draft.start}
          error={invalidRange}
          onValueChange={(start) => setDraft((current) => ({ ...current, start }))}
        />
        <TextFieldInput
          label="结束日期"
          type="date"
          value={draft.end}
          error={invalidRange}
          supportingText={invalidRange ? '结束日期不能早于开始日期' : undefined}
          onValueChange={(end) => setDraft((current) => ({ ...current, end }))}
        />
        <SelectField
          label="支付平台"
          value={draft.source}
          options={[
            { value: 'all', label: '全部平台' },
            ...SOURCE_OPTIONS,
          ]}
          onValueChange={(source) => setDraft((current) => ({ ...current, source }))}
        />
        <SelectField
          label="分类"
          value={draft.category}
          options={[
            { value: 'all', label: '全部分类' },
            ...categories.map((category) => ({ value: category, label: category })),
          ]}
          onValueChange={(category) => setDraft((current) => ({ ...current, category }))}
        />
        <div className="filter-actions">
          <Button variant="outlined" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
          <Button variant="filled" disabled={invalidRange} onClick={applyFilters}>
            应用筛选
          </Button>
          <Button variant="text" onClick={resetFilters}>
            重置
          </Button>
        </div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title="数据刷新失败，当前展示上次结果"
          action={
            <Button variant="text" onClick={() => void refresh()}>
              重试
            </Button>
          }
        >
          <p>{error}</p>
        </InlineAlert>
      ) : null}

      {!hasAnyTransactions ? (
        <EmptyState
          icon={Wallet}
          title="还没有交易数据"
          description="导入微信支付 XLSX 或支付宝 CSV 账单后，这里会显示收支指标、趋势与分类分布。所有解析都在本机完成。"
          action={
            <Button variant="filled" onClick={onOpenImports}>
              去导入账单
            </Button>
          }
        />
      ) : isPeriodEmpty ? (
        <EmptyState
          icon={AlertTriangle}
          title="本期没有交易"
          description="当前日期范围与筛选条件下没有计入统计的交易。可以调整筛选，或回到本月查看。"
          action={
            <Button variant="outlined" onClick={resetFilters}>
              回到本月
            </Button>
          }
        />
      ) : (
        <>
          {dashboard.pendingCount > 0 ? (
            <InlineAlert
              tone="warning"
              title={`${formatCount(dashboard.pendingCount)} 笔交易待处理`}
              action={
                <Button variant="text" onClick={() => onOpenTransactions('pending')}>
                  查看待处理
                </Button>
              }
            >
              <p>包括性质待确认的转账，以及尚未匹配原消费的退款。它们不会按普通支出或收入计入指标。</p>
            </InlineAlert>
          ) : null}

          <section className="metric-grid" aria-label="本期关键指标">
            <MetricCard
              label="总支出"
              value={formatMoney(dashboard.totalExpenseCents)}
              hint={`${formatCount(dashboard.transactionCount)} 笔交易纳入本期`}
              icon={ArrowUpRight}
              tone="expense"
              footer={<DeltaHint current={dashboard.totalExpenseCents} previous={previous?.totalExpenseCents ?? 0} goodWhenUp={false} />}
            />
            <MetricCard
              label="总收入"
              value={formatMoney(dashboard.totalIncomeCents)}
              hint="仅统计收/支字段明确为收入的交易"
              icon={ArrowDownRight}
              tone="income"
              footer={<DeltaHint current={dashboard.totalIncomeCents} previous={previous?.totalIncomeCents ?? 0} goodWhenUp />}
            />
            <MetricCard
              label="净支出"
              value={formatMoney(dashboard.netExpenseCents)}
              hint="总支出减去已关联原消费的退款"
              icon={Wallet}
              footer={<DeltaHint current={dashboard.netExpenseCents} previous={previous?.netExpenseCents ?? 0} goodWhenUp={false} />}
            />
            <MetricCard
              label="待处理"
              value={formatCount(dashboard.pendingCount)}
              hint={`退款合计 ${formatMoney(dashboard.refundCents)}`}
              icon={AlertTriangle}
              tone={dashboard.pendingCount > 0 ? 'warning' : 'default'}
              footer={
                dashboard.pendingCount > 0 ? (
                  <Button variant="text" size="s" onClick={() => onOpenTransactions('pending')}>
                    逐条查看
                  </Button>
                ) : (
                  <span className="muted">没有待处理交易</span>
                )
              }
            />
          </section>

          <div className="dashboard-split">
            <SectionCard
              title="收支趋势"
              subtitle={granularity === 'day' ? '按日汇总，金额为计入统计的交易' : '按自然月汇总，金额为计入统计的交易'}
            >
              <TrendChart points={trendPoints} granularity={granularity} />
            </SectionCard>
            <SectionCard title="分类分布" subtitle="本期计入统计的支出">
              <CategoryChart data={dashboard.categoryTotals} totalExpenseCents={dashboard.totalExpenseCents} />
            </SectionCard>
          </div>

          <div className="dashboard-split dashboard-split--even">
            <SectionCard title="商户排行" subtitle="本期支出金额最高的商户">
              <MerchantRanking data={dashboard.merchantTotals} totalExpenseCents={dashboard.totalExpenseCents} />
            </SectionCard>
            <SectionCard
              title="最近交易"
              subtitle="按交易时间倒序"
              action={
                <Button variant="text" onClick={() => onOpenTransactions('all')}>
                  查看全部
                </Button>
              }
            >
              <RecentTransactions transactions={transactions.slice(0, 6)} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

function DeltaHint({
  current,
  previous,
  goodWhenUp,
}: {
  current: number;
  previous: number;
  goodWhenUp: boolean;
}) {
  const delta = formatDelta(current, previous);
  if (delta.direction === 'flat') {
    return (
      <span className="metric-delta" data-tone="flat">
        <Minus size={14} aria-hidden="true" />
        {delta.text}
        {delta.text === '上期无数据' ? null : <span>较上期</span>}
      </span>
    );
  }
  const good = delta.direction === 'up' ? goodWhenUp : !goodWhenUp;
  const Icon = delta.direction === 'up' ? TrendingUp : TrendingDown;
  return (
    <span className="metric-delta" data-tone={good ? 'good' : 'bad'}>
      <Icon size={14} aria-hidden="true" />
      {delta.text}
      <span>较上期</span>
    </span>
  );
}

function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="muted">本期还没有可展示的交易。</p>;
  }
  return (
    <ul className="recent-list">
      {transactions.map((tx) => (
        <li key={tx.id}>
          <div className="recent-main">
            <span className="recent-merchant" title={tx.merchant}>
              {tx.merchant || '未标记对象'}
            </span>
            <span className="recent-meta">
              {formatDate(tx.occurredAt)} {formatTime(tx.occurredAt)} · {tx.category} · {SOURCE_LABELS[tx.source]}
            </span>
          </div>
          <div className="recent-amount">
            <span className={amountClass(tx)}>{formatTransactionAmount(tx)}</span>
            <StatusChip tone={KIND_TONES[tx.kind]} title={tx.ruleReason}>
              {KIND_LABELS[tx.kind]}
            </StatusChip>
          </div>
        </li>
      ))}
    </ul>
  );
}

function amountClass(tx: Transaction): string {
  if (!tx.included) return 'amount amount--muted';
  if (tx.kind === 'income' || tx.kind === 'refund') return 'amount amount--income';
  if (tx.kind === 'cancelled' || tx.kind === 'pending') return 'amount amount--muted';
  return 'amount';
}
