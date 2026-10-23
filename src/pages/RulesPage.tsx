import { useState } from 'react';
import { Button } from 'material/react';
import { FolderCog, Plus } from 'lucide-react';
import { useLens } from '../app/ExpenseLensProvider';
import { useConfirm } from '../app/confirm';
import { PageHeader, SectionCard } from '../components/layout';
import { SwitchInput } from '../components/inputs';
import { EmptyState, InlineAlert, PageError, PageLoading } from '../components/states';
import { RuleFormDialog } from '../components/RuleFormDialog';
import type { CategoryRule, CategoryRuleInput } from '../types';
import { formatDateTime } from '../lib/format';

type EditorState = { mode: 'create' | 'edit'; rule: CategoryRule | null };

export function RulesPage() {
  const { rules, loading, error, refresh, saveCategoryRule, deleteCategoryRule } = useLens();
  const confirm = useConfirm();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleRule = async (rule: CategoryRule) => {
    setSavingId(rule.id);
    await saveCategoryRule({
      id: rule.id,
      name: rule.name,
      pattern: rule.pattern,
      category: rule.category,
      enabled: !rule.enabled,
    });
    setSavingId(null);
  };

  const removeRule = async (rule: CategoryRule) => {
    const accepted = await confirm({
      title: '删除分类规则？',
      message: `“${rule.name}”将不再参与后续导入分类。`,
      detail: '已有交易的分类不会被更改。',
      confirmLabel: '删除',
      tone: 'danger',
    });
    if (!accepted) return;
    setDeletingId(rule.id);
    await deleteCategoryRule(rule.id);
    setDeletingId(null);
  };

  const saveRule = (input: CategoryRuleInput) => saveCategoryRule(input);

  if (loading && rules.length === 0) return <PageLoading label="正在加载分类规则…" />;

  if (error && rules.length === 0) {
    return (
      <div className="page">
        <PageHeader title="分类规则" description="用关键词规则改善后续导入的分类。" />
        <PageError message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="分类规则"
        description="用关键词规则改善后续导入的分类；不会回溯修改已有交易。"
        actions={
          <Button variant="filled" onClick={() => setEditor({ mode: 'create', rule: null })}>
            <Plus size={18} aria-hidden="true" />
            新建规则
          </Button>
        }
      />

      <InlineAlert tone="info" title="规则如何生效">
        <p>
          导入时会把“商户 + 说明”转为小写后做包含匹配。规则按创建时间从新到旧执行，命中第一条即停止；停用的规则会被跳过。
          当前数据模型不提供优先级编辑，因此页面只展示实际执行顺序。
        </p>
      </InlineAlert>

      {rules.length === 0 ? (
        <EmptyState
          icon={FolderCog}
          title="还没有分类规则"
          description="创建一条关键词规则，让之后的微信或支付宝账单自动归入合适的分类。例如把“星巴克”归入“餐饮”。"
          action={
            <Button variant="filled" onClick={() => setEditor({ mode: 'create', rule: null })}>
              创建第一条规则
            </Button>
          }
        />
      ) : (
        <SectionCard
          title="规则列表"
          subtitle={`共 ${rules.length} 条；顺序即导入时的实际匹配顺序。`}
          action={
            <Button variant="text" onClick={() => void refresh()} disabled={loading}>
              刷新
            </Button>
          }
        >
          <div className="table-scroll">
            <table className="data-table rules-table">
              <caption className="visually-hidden">分类规则列表</caption>
              <thead>
                <tr>
                  <th scope="col">规则</th>
                  <th scope="col">关键词</th>
                  <th scope="col">归入分类</th>
                  <th scope="col">状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr key={rule.id}>
                    <td>
                      <div className="rule-name-cell">
                        <span className="rule-order">#{index + 1}</span>
                        <div className="cell-stack">
                          <span className="row-title">{rule.name}</span>
                          <span className="row-sub">
                            创建于 {formatDateTime(rule.createdAt)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="rule-pattern">{rule.pattern}</code>
                    </td>
                    <td>
                      <span className="chip">{rule.category}</span>
                    </td>
                    <td>
                      <div className="row-flags">
                        <SwitchInput
                          label={rule.enabled ? '已启用' : '已停用'}
                          checked={rule.enabled}
                          disabled={savingId === rule.id || deletingId === rule.id}
                          onCheckedChange={() => void toggleRule(rule)}
                        />
                        {savingId === rule.id ? <span className="row-sub">保存中…</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="cell-actions">
                        <Button
                          variant="text"
                          size="s"
                          aria-label={`编辑分类规则：${rule.name}`}
                          disabled={savingId === rule.id || deletingId === rule.id}
                          onClick={() => setEditor({ mode: 'edit', rule })}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="text"
                          size="s"
                          className="danger-action"
                          aria-label={`删除分类规则：${rule.name}`}
                          disabled={savingId === rule.id || deletingId === rule.id}
                          onClick={() => void removeRule(rule)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {editor ? (
        <RuleFormDialog
          rule={editor.rule}
          onClose={() => setEditor(null)}
          onSave={saveRule}
        />
      ) : null}
    </div>
  );
}
