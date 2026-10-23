import { useState } from 'react';
import { Button, Dialog } from 'material/react';
import { Info } from 'lucide-react';
import type { CategoryRule, CategoryRuleInput } from '../types';
import { categoryOptions, EXPENSE_CATEGORIES } from '../domain/labels';
import { InlineAlert } from './states';
import { SelectField, SwitchInput, TextFieldInput } from './inputs';

interface RuleFormDialogProps {
  rule: CategoryRule | null;
  onClose: () => void;
  onSave: (input: CategoryRuleInput) => Promise<boolean>;
}

interface FormErrors {
  name?: string;
  pattern?: string;
  category?: string;
}

export function RuleFormDialog({ rule, onClose, onSave }: RuleFormDialogProps) {
  const [name, setName] = useState(rule?.name ?? '');
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [category, setCategory] = useState(rule?.category ?? EXPENSE_CATEGORIES[0]);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = categoryOptions(EXPENSE_CATEGORIES, rule ? [rule.category] : []);

  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = '请输入规则名称。';
    if (!pattern.trim()) nextErrors.pattern = '请输入用于匹配的关键词。';
    if (!category.trim()) nextErrors.category = '请选择分类。';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    const ok = await onSave({
      id: rule?.id,
      name: name.trim(),
      pattern: pattern.trim(),
      category,
      enabled,
    });
    setSaving(false);
    if (ok) onClose();
    else setSubmitError('保存失败，请查看页面提示后重试。');
  };

  return (
    <Dialog
      open
      size="medium"
      headline={rule ? '编辑分类规则' : '新建分类规则'}
      noCloseOnEscape={saving}
      onClose={close}
      actions={
        <>
          <Button variant="text" onClick={close} disabled={saving}>
            取消
          </Button>
          <Button variant="filled" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存规则'}
          </Button>
        </>
      }
    >
      <div className="dialog-form">
        <TextFieldInput
          label="规则名称"
          value={name}
          onValueChange={setName}
          required
          error={Boolean(errors.name)}
          supportingText={errors.name ?? '仅用于识别这条规则。'}
        />
        <TextFieldInput
          label="关键词"
          value={pattern}
          onValueChange={setPattern}
          required
          error={Boolean(errors.pattern)}
          supportingText={errors.pattern ?? '与导入时的“商户 + 说明”做不区分大小写的包含匹配。'}
        />
        <SelectField
          label="归入分类"
          value={category}
          required
          options={categories.map((item) => ({ value: item, label: item }))}
          error={Boolean(errors.category)}
          supportingText={errors.category}
          onValueChange={setCategory}
        />
        <SwitchInput
          label="启用规则"
          checked={enabled}
          onCheckedChange={setEnabled}
          supportingText="停用后不会参与后续导入的分类。"
        />
        <InlineAlert tone="info" title="仅影响后续导入" icon={Info}>
          <p>规则不会回溯修改已有交易。规则按创建时间从新到旧依次匹配，命中第一条即停止。</p>
        </InlineAlert>
        {submitError ? (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
