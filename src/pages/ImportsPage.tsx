import { useRef, useState, type DragEvent } from 'react';
import { Button } from 'material/react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { useLens } from '../app/ExpenseLensProvider';
import { useConfirm } from '../app/confirm';
import { PageHeader, SectionCard } from '../components/layout';
import { SelectField, type SelectChoice } from '../components/inputs';
import { EmptyState, InlineAlert } from '../components/states';
import { SOURCE_LABELS } from '../domain/labels';
import { formatCount, formatDateTime, formatTransactionAmount } from '../lib/format';

const MAPPING_FIELDS = [
  { field: 'time', label: '交易时间', required: true },
  { field: 'amount', label: '金额', required: true },
  { field: 'direction', label: '收/支方向', required: true },
  { field: 'type', label: '交易类型', required: false },
  { field: 'merchant', label: '交易对方 / 商户', required: false },
  { field: 'description', label: '商品说明', required: false },
  { field: 'method', label: '支付方式', required: false },
  { field: 'status', label: '当前状态', required: false },
  { field: 'platformId', label: '交易单号', required: false },
  { field: 'rawCategory', label: '原始分类', required: false },
] as const;

export function ImportsPage() {
  const {
    drafts,
    setDrafts,
    busy,
    stage,
    parseFailures,
    lastImport,
    importError,
    handleFiles,
    changeMapping,
    duplicateStats,
    confirmImport,
  } = useLens();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mappingBusy, setMappingBusy] = useState<number | null>(null);

  const hasDrafts = drafts.length > 0;
  const openPicker = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const requestReselect = async () => {
    if (busy) return;
    if (hasDrafts) {
      const accepted = await confirm({
        title: '重新选择账单？',
        message: '当前解析结果与重复项选择将被清空。',
        confirmLabel: '重新选择',
      });
      if (!accepted) return;
      setDrafts([]);
    }
    openPicker();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy) return;
    void handleFiles(event.dataTransfer.files);
  };

  const views = drafts.map((draft, index) => {
    const stats = duplicateStats(draft.result);
    const suspected = stats.suspected.flatMap((match) => {
      const row = draft.result.parsed.find((item) => item.transaction.id === match.id);
      return row ? [{ match, row }] : [];
    });
    return { draft, index, stats, suspected };
  });

  const readyCount = drafts.filter((draft) => !draft.result.mappingNeeded).length;
  const totalParsed = drafts.reduce((sum, draft) => sum + draft.result.parsed.length, 0);
  const totalIssues = drafts.reduce((sum, draft) => sum + draft.result.issues.length, 0);
  const suspectedCount = views.reduce((sum, view) => sum + view.suspected.length, 0);
  const unresolvedCount = views.reduce(
    (sum, view) =>
      sum +
      (view.draft.result.mappingNeeded
        ? 0
        : view.suspected.filter(({ match }) => !view.draft.choices[match.id]).length),
    0,
  );

  const confirmDisabled = busy || readyCount === 0 || unresolvedCount > 0;
  const confirmHint =
    unresolvedCount > 0
      ? `还有 ${unresolvedCount} 笔疑似重复需要选择处理方式。`
      : readyCount === 0
        ? '请先完成交易时间、金额与收支方向的映射。'
        : '确认后将写入本地数据库；可在数据管理中按批次撤销。';

  const importTotals = lastImport
    ? lastImport.reduce(
        (totals, report) => ({
          added: totals.added + report.added,
          duplicates: totals.duplicates + report.duplicates,
          excluded: totals.excluded + report.batch.excludedCount,
        }),
        { added: 0, duplicates: 0, excluded: 0 },
      )
    : null;

  return (
    <div className="page">
      <PageHeader
        title="账单导入"
        description="在本机解析微信 XLSX 或支付宝 CSV 账单，确认字段与重复项后再写入数据库。"
        actions={
          <Button variant="filled" onClick={() => void requestReselect()} disabled={busy}>
            <Upload size={18} aria-hidden="true" />
            {hasDrafts ? '重新选择文件' : '选择账单文件'}
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        hidden
        data-testid="bill-file-input"
        aria-label="选择账单文件"
        onChange={(event) => {
          const files = event.currentTarget.files;
          void handleFiles(files);
          event.currentTarget.value = '';
        }}
      />

      {stage !== 'idle' ? (
        <div className="import-progress" role="status" aria-live="polite">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{stage === 'parsing' ? '正在本地解析账单…' : '正在写入本地数据库…'}</span>
        </div>
      ) : null}

      {importError ? (
        <InlineAlert tone="error" title="导入未完成，数据库事务已回滚">
          <p>{importError}</p>
          <p>当前解析结果仍保留在页面中，修正问题后可以重新确认导入。</p>
        </InlineAlert>
      ) : null}

      {parseFailures.length > 0 ? (
        <InlineAlert tone="error" title="部分文件未能解析">
          <ul className="file-result-list">
            {parseFailures.map((failure, index) => (
              <li key={`${failure.filename}-${index}`}>
                <span>{failure.filename}</span>
                <span className="muted">{failure.message}</span>
              </li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}

      {lastImport && importTotals ? (
        <SectionCard
          title="上次导入结果"
          subtitle="来自本次导入的实际回执；失败的文件不会计入。"
          variant="filled"
        >
          <div className="import-result-grid">
            <div className="result-stat">
              <span>新增</span>
              <strong>{formatCount(importTotals.added)}</strong>
            </div>
            <div className="result-stat">
              <span>跳过重复</span>
              <strong>{formatCount(importTotals.duplicates)}</strong>
            </div>
            <div className="result-stat">
              <span>排除统计</span>
              <strong>{formatCount(importTotals.excluded)}</strong>
            </div>
          </div>
          <ul className="file-result-list">
            {lastImport.map((report) => (
              <li key={report.batch.id}>
                <span>{report.batch.filename}</span>
                <span className="muted">
                  新增 {formatCount(report.added)} · 重复 {formatCount(report.duplicates)} · 排除{' '}
                  {formatCount(report.batch.excludedCount)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {!hasDrafts ? (
        <>
          {lastImport ? null : (
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <span className="drop-icon" aria-hidden="true">
                <FileSpreadsheet size={30} />
              </span>
              <h2>选择微信或支付宝账单</h2>
              <p>
                支持微信支付 XLSX 与支付宝 CSV。文件只在本机解析，不会上传；导入前会先展示字段映射、异常行与重复项。
              </p>
              <Button variant="filled" onClick={() => void requestReselect()} disabled={busy}>
                <Upload size={18} aria-hidden="true" />
                选择本地文件
              </Button>
            </div>
          )}

          {lastImport ? (
            <EmptyState
              icon={CheckCircle2}
              title="本次账单已处理"
              description="可以继续选择下一份账单。导入结果会保留在上方，直到开始下一次解析。"
              action={
                <Button variant="filled" onClick={() => void requestReselect()} disabled={busy}>
                  继续导入
                </Button>
              }
            />
          ) : null}

          {!lastImport && parseFailures.length === 0 ? (
            <InlineAlert tone="info" title="导入前会先核对" icon={Info}>
              <p>
                系统会尝试识别表头；无法识别时，需要手动指定交易时间、金额与收支方向。确定重复会自动跳过，疑似重复必须逐条确认。
              </p>
            </InlineAlert>
          ) : null}
        </>
      ) : (
        <>
          {views.map(({ draft, index, stats, suspected }) => {
            const missing = MAPPING_FIELDS.filter(
              (field) => field.required && draft.result.mapping[field.field] === undefined,
            ).map((field) => field.label);
            const columnOptions: SelectChoice[] = [
              { value: '-1', label: '未映射' },
              ...draft.result.headers.map((header, columnIndex) => ({
                value: String(columnIndex),
                label: `第 ${columnIndex + 1} 列 · ${header || '未命名'}`,
              })),
            ];
            return (
              <SectionCard
                key={`${draft.result.filename}-${index}`}
                title={draft.result.filename}
                subtitle={`${SOURCE_LABELS[draft.result.source]} · 共 ${formatCount(draft.result.rowCount)} 行数据`}
                action={
                  <div className="draft-stats">
                    <span className="stat-pill">
                      <strong>{formatCount(draft.result.parsed.length)}</strong> 可导入
                    </span>
                    <span className="stat-pill">
                      <strong>{formatCount(draft.result.issues.length)}</strong> 异常
                    </span>
                    <span className="stat-pill">
                      <strong>{formatCount(stats.suspected.length)}</strong> 疑似重复
                    </span>
                  </div>
                }
              >
                <div className="import-draft">
                  {draft.result.mappingNeeded ? (
                    <InlineAlert tone="warning" title="还需要完成必需字段映射">
                      <p>缺少：{missing.join('、') || '必需字段'}。映射完成后才能确认导入。</p>
                    </InlineAlert>
                  ) : null}

                  <div className="mapping-grid">
                    {MAPPING_FIELDS.map((field) => {
                      const column = draft.result.mapping[field.field];
                      return (
                        <SelectField
                          key={field.field}
                          label={`${field.label}${field.required ? ' *' : ''}`}
                          value={column === undefined ? '-1' : String(column)}
                          options={columnOptions}
                          disabled={busy || mappingBusy === index}
                          supportingText={
                            column === undefined
                              ? field.required
                                ? '必填'
                                : '未映射时将留空'
                              : `使用第 ${column + 1} 列`
                          }
                          onValueChange={(value) => {
                            setMappingBusy(index);
                            void changeMapping(index, field.field, Number(value)).finally(() =>
                              setMappingBusy(null),
                            );
                          }}
                        />
                      );
                    })}
                  </div>

                  {draft.result.issues.length > 0 ? (
                    <details className="issues-panel">
                      <summary>
                        {formatCount(draft.result.issues.length)} 行未导入 · 查看解析原因
                      </summary>
                      <div className="issues-scroll">
                        <table className="issues-table">
                          <thead>
                            <tr>
                              <th scope="col">行号</th>
                              <th scope="col">原因</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.result.issues.map((issue) => (
                              <tr key={`${issue.rowNumber}-${issue.reason}`}>
                                <td>{issue.rowNumber}</td>
                                <td>{issue.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}

                  {stats.certain > 0 ? (
                    <InlineAlert tone="info" title={`${formatCount(stats.certain)} 笔确定重复`}>
                      <p>平台单号或规范化指纹与已有交易一致，导入时会自动跳过。</p>
                    </InlineAlert>
                  ) : null}

                  {suspected.length > 0 ? (
                    <div className="duplicate-list">
                      <InlineAlert tone="warning" title="以下记录疑似重复，需要逐条确认">
                        <p>时间、金额与商户相似；选择“跳过这条”不会写入，选择“仍然导入”会作为独立交易保留。</p>
                      </InlineAlert>
                      {suspected.map(({ match, row }) => {
                        const decision = draft.choices[match.id];
                        return (
                          <div className="duplicate-row" key={match.id}>
                            <div className="duplicate-copy">
                              <strong>
                                {row.transaction.merchant} · {formatTransactionAmount(row.transaction)}
                              </strong>
                              <p>
                                {formatDateTime(row.transaction.occurredAt)} · 与已有交易“{match.candidate}”相似
                              </p>
                              <p>{match.reason}</p>
                            </div>
                            <SelectField
                              label="处理方式"
                              value={decision ?? ''}
                              options={[
                                { value: '', label: '请选择', disabled: true },
                                { value: 'skip', label: '跳过这条' },
                                { value: 'new', label: '仍然导入' },
                              ]}
                              error={!decision}
                              supportingText={decision ? undefined : '需要确认'}
                              onValueChange={(value) => {
                                if (value !== 'skip' && value !== 'new') return;
                                setDrafts((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          choices: { ...item.choices, [match.id]: value },
                                        }
                                      : item,
                                  ),
                                );
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            );
          })}

          <div className="import-actions">
            <div className="import-actions-copy">
              <strong>
                {formatCount(readyCount)} / {formatCount(drafts.length)} 个文件已就绪
              </strong>
              <span>
                {formatCount(totalParsed)} 笔有效 · {formatCount(totalIssues)} 行异常 ·{' '}
                {formatCount(suspectedCount)} 笔疑似重复
              </span>
              <span>{confirmHint}</span>
            </div>
            <div className="import-actions-buttons">
              <Button
                variant="text"
                onClick={() => setDrafts([])}
                disabled={busy}
              >
                取消导入
              </Button>
              <Button
                variant="filled"
                onClick={() => void confirmImport()}
                disabled={confirmDisabled}
              >
                {busy && stage === 'importing' ? '正在导入…' : '确认导入'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
