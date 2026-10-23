import { useEffect, useState } from 'react';
import { Button, Dialog } from 'material/react';
import type { Transaction, TransactionKind } from '../types';
import { KIND_OPTIONS, SOURCE_LABELS } from '../domain/labels';
import { formatDateTime, formatTransactionAmount } from '../lib/format';
import { SelectField, SwitchInput, TextFieldInput } from './inputs';

export interface TransactionUpdateInput {
  category: string;
  kind: TransactionKind;
  included: boolean;
}

interface TransactionEditDialogProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, update: TransactionUpdateInput) => Promise<boolean>;
}

export function TransactionEditDialog({ transaction, onClose, onSave }: TransactionEditDialogProps) {
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [included, setIncluded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setCategory(transaction.category);
    setKind(transaction.kind);
    setIncluded(transaction.included);
    setError(null);
    setSaving(false);
  }, [transaction]);

  if (!transaction) return null;

  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    const trimmed = category.trim();
    if (!trimmed) {
      setError('分类不能为空。');
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave(transaction.id, { category: trimmed, kind, included });
    setSaving(false);
    if (ok) onClose();
    else setError('保存失败，请查看页面提示后重试。');
  };

  return (
    <Dialog
      open
      size="medium"
      headline="编辑交易"
      noCloseOnEscape={saving}
      onClose={close}
      actions={
        <>
          <Button variant="text" onClick={close} disabled={saving}>
            取消
          </Button>
          <Button variant="filled" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="dialog-form">
        <dl className="dialog-summary">
          <div>
            <dt>交易时间</dt>
            <dd>{formatDateTime(transaction.occurredAt)}</dd>
          </div>
          <div>
            <dt>商户</dt>
            <dd>{transaction.merchant || '未标记对象'}</dd>
          </div>
          <div>
            <dt>金额</dt>
            <dd>{formatTransactionAmount(transaction)}</dd>
          </div>
          <div>
            <dt>来源</dt>
            <dd>{SOURCE_LABELS[transaction.source]}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{transaction.status || '未标记'}</dd>
          </div>
          <div>
            <dt>规则说明</dt>
            <dd>{transaction.ruleReason || '—'}</dd>
          </div>
        </dl>

        <TextFieldInput
          label="分类"
          value={category}
          onValueChange={setCategory}
          required
          error={Boolean(error)}
          supportingText={error ?? '保存后会标记为手动修改，并写入审计日志。'}
        />

        <SelectField
          label="交易类型"
          value={kind}
          options={KIND_OPTIONS}
          onValueChange={(value) => setKind(value as TransactionKind)}
          supportingText="类型决定该交易在统计中的含义。"
        />

        <SwitchInput
          label="计入统计"
          checked={included}
          onCheckedChange={setIncluded}
          supportingText="关闭后，该交易不会计入支出、收入或分类汇总。"
        />
      </div>
    </Dialog>
  );
}
