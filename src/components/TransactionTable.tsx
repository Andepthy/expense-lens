import { Button } from 'material/react';
import type { Transaction } from '../types';
import { KIND_LABELS, KIND_TONES, SOURCE_LABELS } from '../domain/labels';
import { formatDate, formatTime, formatTransactionAmount } from '../lib/format';

export type SortKey = 'occurredAt' | 'amountCents' | 'merchant';
export interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}

interface TransactionTableProps {
  transactions: Transaction[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onEdit: (transaction: Transaction) => void;
}

export function TransactionTable({ transactions, sort, onSort, onEdit }: TransactionTableProps) {
  return (
    <>
      <div className="table-scroll transactions-table-view">
        <table className="data-table transactions-table">
          <caption className="visually-hidden">交易明细列表</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort(sort, 'occurredAt')}>
                <SortButton label="日期" sortKey="occurredAt" sort={sort} onSort={onSort} />
              </th>
              <th scope="col" aria-sort={ariaSort(sort, 'merchant')}>
                <SortButton label="商户 / 说明" sortKey="merchant" sort={sort} onSort={onSort} />
              </th>
              <th scope="col">分类</th>
              <th scope="col">类型</th>
              <th scope="col" className="numeric" aria-sort={ariaSort(sort, 'amountCents')}>
                <SortButton label="金额" sortKey="amountCents" sort={sort} onSort={onSort} numeric />
              </th>
              <th scope="col">来源 / 支付方式</th>
              <th scope="col">状态</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>
                  <div className="cell-stack cell-date">
                    <span>{formatDate(tx.occurredAt)}</span>
                    <span className="row-sub">{formatTime(tx.occurredAt)}</span>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <span className="row-title" title={tx.merchant}>
                      {tx.merchant || '未标记对象'}
                    </span>
                    <span className="row-sub" title={tx.description}>
                      {tx.description || '无说明'}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="chip">{tx.category}</span>
                </td>
                <td>
                  <span className="chip" data-tone={KIND_TONES[tx.kind]}>
                    {KIND_LABELS[tx.kind]}
                  </span>
                </td>
                <td className="numeric">
                  <span className={amountClass(tx)}>{formatTransactionAmount(tx)}</span>
                </td>
                <td>
                  <div className="cell-stack">
                    <span>{SOURCE_LABELS[tx.source]}</span>
                    <span className="row-sub">{tx.paymentMethod || '未标记方式'}</span>
                  </div>
                </td>
                <td>
                  <div className="row-flags">
                    <span title={tx.status}>{tx.status || '未标记状态'}</span>
                    <Flags tx={tx} />
                  </div>
                </td>
                <td>
                  <div className="cell-actions">
                    <Button
                      variant="text"
                      size="s"
                      aria-label={`编辑交易：${tx.merchant || '未标记对象'} ${formatDate(tx.occurredAt)}`}
                      onClick={() => onEdit(tx)}
                    >
                      编辑
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="transaction-cards" aria-label="交易明细卡片列表">
        {transactions.map((tx) => (
          <li className="transaction-card" key={tx.id}>
            <div className="transaction-card-top">
              <div className="cell-stack">
                <span className="row-title" title={tx.merchant}>
                  {tx.merchant || '未标记对象'}
                </span>
                <span className="row-sub">{tx.description || '无说明'}</span>
              </div>
              <span className={amountClass(tx)}>{formatTransactionAmount(tx)}</span>
            </div>
            <div className="transaction-card-meta">
              <span>
                {formatDate(tx.occurredAt)} {formatTime(tx.occurredAt)}
              </span>
              <span>{SOURCE_LABELS[tx.source]}</span>
              <span>{tx.paymentMethod || '未标记方式'}</span>
            </div>
            <div className="transaction-card-flags">
              <span className="chip">{tx.category}</span>
              <span className="chip" data-tone={KIND_TONES[tx.kind]}>
                {KIND_LABELS[tx.kind]}
              </span>
              <span className="chip">{tx.status || '未标记状态'}</span>
              <Flags tx={tx} />
              <Button
                variant="text"
                size="s"
                aria-label={`编辑交易：${tx.merchant || '未标记对象'} ${formatDate(tx.occurredAt)}`}
                onClick={() => onEdit(tx)}
              >
                编辑
              </Button>
            </div>
            {!tx.included ? (
              <p className="transaction-card-note">{tx.exclusionReason ?? '未计入统计'}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function Flags({ tx }: { tx: Transaction }) {
  return (
    <>
      {tx.kind === 'refund' && tx.linkedTransactionId ? (
        <span className="chip" data-tone="success">
          已关联原消费
        </span>
      ) : null}
      {tx.kind === 'refund' && !tx.linkedTransactionId ? (
        <span className="chip" data-tone="pending">
          待确认关联
        </span>
      ) : null}
      {tx.manuallyModified ? <span className="chip">已手动修改</span> : null}
      {!tx.included ? (
        <span className="chip" data-tone="cancelled" title={tx.exclusionReason ?? undefined}>
          不计入统计
        </span>
      ) : null}
    </>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  numeric = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className="sort-button"
      style={numeric ? { width: '100%', justifyContent: 'flex-end' } : undefined}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="sort-indicator" aria-hidden="true">
        {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  );
}

function ariaSort(sort: SortState, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sort.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function amountClass(tx: Transaction): string {
  if (!tx.included) return 'amount amount--muted';
  if (tx.kind === 'income' || tx.kind === 'refund') return 'amount amount--income';
  if (tx.kind === 'cancelled' || tx.kind === 'pending') return 'amount amount--muted';
  return 'amount';
}
