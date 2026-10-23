import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card } from 'material/react';
import {
  Database,
  Download,
  FileJson,
  HardDrive,
  Info,
  RotateCcw,
  ShieldAlert,
  Undo2,
  Upload,
} from 'lucide-react';
import { useLens } from '../app/ExpenseLensProvider';
import { useConfirm } from '../app/confirm';
import { PageHeader, SectionCard } from '../components/layout';
import { SelectField, TextFieldInput } from '../components/inputs';
import { EmptyState, InlineAlert, PageError, PageLoading } from '../components/states';
import {
  categoryOptions,
  EXPENSE_CATEGORIES,
  KIND_OPTIONS,
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  SYSTEM_CATEGORIES,
} from '../domain/labels';
import type { Source } from '../types';
import { isValidRange } from '../lib/dateRange';
import { formatBytes, formatCount, formatDateTime } from '../lib/format';

interface DataPageProps {
  onOpenImports: () => void;
}

export function DataPage({ onOpenImports }: DataPageProps) {
  const {
    info,
    batches,
    transactions,
    range,
    restoreMode,
    setRestoreMode,
    backup,
    exportJson,
    exportCsv,
    restore,
    moveDatabase,
    clearAll,
    undoBatch,
    loading,
    error,
    refresh,
  } = useLens();
  const confirm = useConfirm();
  const [pending, setPending] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [exportFilters, setExportFilters] = useState({
    start: range.start,
    end: range.end,
    source: 'all',
    category: 'all',
    kind: 'all',
  });

  useEffect(() => {
    setExportFilters((current) => ({ ...current, start: range.start, end: range.end }));
  }, [range.start, range.end]);

  const categories = useMemo(
    () => categoryOptions(EXPENSE_CATEGORIES, SYSTEM_CATEGORIES, transactions.map((tx) => tx.category)),
    [transactions],
  );

  const exportInvalid = !isValidRange(exportFilters.start, exportFilters.end);
  const busy = pending !== null;

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } finally {
      setPending(null);
    }
  };

  const undo = async (batchId: string, filename: string, addedCount: number) => {
    const accepted = await confirm({
      title: '撤销这个导入批次？',
      message: `将删除“${filename}”批次新增的 ${formatCount(addedCount)} 笔交易。`,
      detail: '引用这些交易关联的退款会被置为待确认；原始账单文件不会被删除。',
      confirmLabel: '撤销批次',
      tone: 'danger',
    });
    if (!accepted) return;
    setUndoingId(batchId);
    await undoBatch(batchId);
    setUndoingId(null);
  };

  if (loading && !info) return <PageLoading label="正在读取数据库状态…" />;

  if (!info) {
    return (
      <div className="page">
        <PageHeader title="数据管理" description="查看本地数据库状态并管理备份。" />
        <PageError message={error ?? '本地数据库暂不可用，请重试。'} onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="数据管理"
        description="查看本地数据库状态，完成备份、恢复、导出与导入批次撤销。"
        actions={
          <Button variant="filled" onClick={() => void run('backup', backup)} disabled={busy}>
            <HardDrive size={18} aria-hidden="true" />
            {pending === 'backup' ? '备份中…' : '备份数据库'}
          </Button>
        }
      />

      {error ? (
        <InlineAlert
          tone="error"
          title="数据状态可能不是最新"
          action={
            <Button variant="text" onClick={() => void refresh()}>
              重试
            </Button>
          }
        >
          <p>{error}</p>
        </InlineAlert>
      ) : null}

      <SectionCard
        title="本地数据库"
        subtitle="SQLite · WAL 模式 · 所有数据保存在本机"
        action={<span className="chip" data-tone="success">已连接</span>}
      >
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">交易笔数</span>
            <span className="info-value">{formatCount(info.transactionCount)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Schema 版本</span>
            <span className="info-value">v{info.schemaVersion}</span>
          </div>
          <div className="info-item">
            <span className="info-label">数据库大小</span>
            <span className="info-value">{formatBytes(info.sizeBytes)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">导入批次</span>
            <span className="info-value">{formatCount(batches.length)}</span>
          </div>
          <div className="info-item info-path">
            <span className="info-label">存储位置</span>
            <span className="info-value" title={info.path}>
              {info.path}
            </span>
          </div>
        </div>
        <p className="data-note" style={{ marginTop: 'var(--el-space-3)' }}>
          <Info size={16} aria-hidden="true" />
          应用不会把账单、数据库或备份上传到远端；文件选择与保存均通过本机对话框完成。
        </p>
      </SectionCard>

      <div className="action-grid">
        <ActionCard
          icon={<HardDrive size={20} aria-hidden="true" />}
          title="备份数据库"
          description="使用 SQLite 在线备份生成一致的 .db 文件。建议在恢复、迁移或清空数据前执行。"
          footer={
            <Button variant="outlined" onClick={() => void run('backup', backup)} disabled={busy}>
              {pending === 'backup' ? '备份中…' : '选择保存位置'}
            </Button>
          }
        />

        <ActionCard
          icon={<RotateCcw size={20} aria-hidden="true" />}
          title="迁移数据库"
          description="把当前数据库迁移到新的本地位置。迁移完成后原数据库文件仍保留，便于回退。"
          footer={
            <Button variant="outlined" onClick={() => void run('move', moveDatabase)} disabled={busy}>
              {pending === 'move' ? '迁移中…' : '选择新位置'}
            </Button>
          }
        />

        <ActionCard
          className="action-card--wide"
          icon={<FileJson size={20} aria-hidden="true" />}
          title="导出数据"
          description="导出完整 JSON 备份，或按日期、平台、分类与类型导出 CSV。"
          footer={
            <div className="btn-row">
              <Button variant="outlined" onClick={() => void run('json', exportJson)} disabled={busy}>
                <Download size={18} aria-hidden="true" />
                {pending === 'json' ? '导出中…' : '导出完整 JSON'}
              </Button>
              <Button
                variant="filled"
                onClick={() => void run('csv', () => exportCsv(exportFilters))}
                disabled={busy || exportInvalid}
              >
                <Download size={18} aria-hidden="true" />
                {pending === 'csv' ? '导出中…' : '导出 CSV'}
              </Button>
            </div>
          }
        >
          <div className="export-form">
            <TextFieldInput
              label="开始日期"
              type="date"
              value={exportFilters.start}
              error={exportInvalid}
              onValueChange={(start) => setExportFilters((current) => ({ ...current, start }))}
            />
            <TextFieldInput
              label="结束日期"
              type="date"
              value={exportFilters.end}
              error={exportInvalid}
              supportingText={exportInvalid ? '结束日期不能早于开始日期' : undefined}
              onValueChange={(end) => setExportFilters((current) => ({ ...current, end }))}
            />
            <SelectField
              label="支付平台"
              value={exportFilters.source}
              options={[{ value: 'all', label: '全部平台' }, ...SOURCE_OPTIONS]}
              onValueChange={(source) => setExportFilters((current) => ({ ...current, source }))}
            />
            <SelectField
              label="分类"
              value={exportFilters.category}
              options={[
                { value: 'all', label: '全部分类' },
                ...categories.map((category) => ({ value: category, label: category })),
              ]}
              onValueChange={(category) => setExportFilters((current) => ({ ...current, category }))}
            />
            <SelectField
              label="收支类型"
              value={exportFilters.kind}
              options={[{ value: 'all', label: '全部类型' }, ...KIND_OPTIONS]}
              onValueChange={(kind) => setExportFilters((current) => ({ ...current, kind }))}
            />
          </div>
        </ActionCard>

        <ActionCard
          className="action-card--wide"
          icon={<Upload size={20} aria-hidden="true" />}
          title="恢复数据"
          description="从 .db、.sqlite、.sqlite3 或 .json 备份恢复。合并模式发生冲突时保留当前记录；替换模式会完整替换当前数据库。"
          footer={
            <div className="btn-row">
              <SelectField
                label="恢复方式"
                value={restoreMode}
                options={[
                  { value: 'merge', label: '合并备份数据' },
                  { value: 'replace', label: '完整替换当前数据' },
                ]}
                onValueChange={(value) => setRestoreMode(value as 'merge' | 'replace')}
                disabled={busy}
                className="filter-field--wide"
              />
              <Button
                variant="outlined"
                onClick={() => void run('restore', restore)}
                disabled={busy}
              >
                {pending === 'restore' ? '恢复中…' : '选择备份并恢复'}
              </Button>
            </div>
          }
        >
          {restoreMode === 'replace' ? (
            <InlineAlert tone="warning" title="替换模式风险">
              <p>当前数据库会被备份内容完整替换。请先完成备份，并在确认对话框中再次确认。</p>
            </InlineAlert>
          ) : null}
        </ActionCard>

        <Card variant="outlined" className="action-card danger-card">
          <div className="action-head">
            <span className="action-head-icon">
              <ShieldAlert size={20} aria-hidden="true" />
            </span>
            <h3>清空所有数据</h3>
          </div>
          <p className="action-description">
            删除交易、导入历史与分类规则。此操作不可撤销，需要连续确认两次；建议先完成数据库备份。
          </p>
          <div className="btn-row">
            <Button
              variant="text"
              className="danger-action"
              onClick={() => void run('clear', clearAll)}
              disabled={busy}
            >
              {pending === 'clear' ? '清空中…' : '清空数据'}
            </Button>
          </div>
        </Card>
      </div>

      <SectionCard
        title="导入批次归档"
        subtitle="按导入时间倒序。应用保存批次元数据与解析后的交易，不复制原始账单文件。"
        action={
          <Button variant="text" onClick={onOpenImports}>
            去导入账单
          </Button>
        }
      >
        {batches.length === 0 ? (
          <EmptyState
            compact
            icon={Database}
            title="还没有导入批次"
            description="导入账单后，可以在这里查看批次统计并撤销整批新增记录。"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table batches-table">
              <caption className="visually-hidden">导入批次归档</caption>
              <thead>
                <tr>
                  <th scope="col">账单文件</th>
                  <th scope="col">来源</th>
                  <th scope="col">导入时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <div className="cell-stack">
                        <span className="row-title batch-name" title={batch.filename}>
                          {batch.filename}
                        </span>
                        <span className="row-sub">
                          新增 {formatCount(batch.addedCount)} · 重复{' '}
                          {formatCount(batch.duplicateCount)} · 排除 {formatCount(batch.excludedCount)}
                        </span>
                      </div>
                    </td>
                    <td>{SOURCE_LABELS[batch.source as Source] ?? batch.source}</td>
                    <td>{formatDateTime(batch.importedAt)}</td>
                    <td>
                      <div className="cell-actions">
                        <Button
                          variant="text"
                          size="s"
                          className="danger-action"
                          disabled={busy || undoingId === batch.id}
                          onClick={() => void undo(batch.id, batch.filename, batch.addedCount)}
                        >
                          <Undo2 size={16} aria-hidden="true" />
                          {undoingId === batch.id ? '撤销中…' : '撤销批次'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  footer,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  footer: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card variant="outlined" className={['action-card', className ?? ''].filter(Boolean).join(' ')}>
      <div className="action-head">
        <span className="action-head-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <p className="action-description">{description}</p>
      {children}
      <div className="btn-row">{footer}</div>
    </Card>
  );
}
