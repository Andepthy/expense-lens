import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithLens } from '../test/render';
import { makeRule } from '../test/lens';
import { clickHost, fireDetail } from '../test/materialEvents';
import { RulesPage } from './RulesPage';

function materialButton(text: string): Element {
  const match = [...document.querySelectorAll('m-button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

function actionButton(prefix: string): Element {
  const match = document.querySelector(`m-button[aria-label^="${prefix}"]`);
  if (!match) throw new Error(`action button not found: ${prefix}`);
  return match;
}

function field(label: string): Element {
  const match = document.querySelector(`m-text-field[label="${label}"]`);
  if (!match) throw new Error(`field not found: ${label}`);
  return match;
}

describe('RulesPage', () => {
  it('renders the rule list with its real order and category', () => {
    renderWithLens(<RulesPage />, { rules: [makeRule()] });
    expect(document.body.textContent).toContain('咖啡关键词');
    expect(document.body.textContent).toContain('星巴克');
    expect(document.body.textContent).toContain('餐饮');
    expect(document.body.textContent).toContain('#1');
  });

  it('toggles a rule by sending an update with the existing id', () => {
    const saveCategoryRule = vi.fn(async () => true);
    const { container } = renderWithLens(<RulesPage />, {
      rules: [makeRule()],
      saveCategoryRule,
    });
    const toggle = container.querySelector('m-switch');
    expect(toggle).not.toBeNull();
    fireDetail(toggle!, 'change', { checked: false });
    expect(saveCategoryRule).toHaveBeenCalledWith({
      id: 'rule-1',
      name: '咖啡关键词',
      pattern: '星巴克',
      category: '餐饮',
      enabled: false,
    });
  });

  it('validates and saves a new rule', async () => {
    const saveCategoryRule = vi.fn(async () => true);
    renderWithLens(<RulesPage />, { rules: [], saveCategoryRule });

    clickHost(materialButton('新建规则'));
    expect(document.querySelector('m-dialog[headline="新建分类规则"]')).not.toBeNull();

    clickHost(materialButton('保存规则'));
    expect(saveCategoryRule).not.toHaveBeenCalled();
    const nameField = field('规则名称');
    expect(nameField.getAttribute('supporting-text')).toBe('请输入规则名称。');
    expect(nameField.hasAttribute('error')).toBe(true);

    fireDetail(field('规则名称'), 'input', { value: '  新规则  ' });
    fireDetail(field('关键词'), 'input', { value: '  测试关键词  ' });
    clickHost(materialButton('保存规则'));

    await waitFor(() =>
      expect(saveCategoryRule).toHaveBeenCalledWith({
        id: undefined,
        name: '新规则',
        pattern: '测试关键词',
        category: '餐饮',
        enabled: true,
      }),
    );
  });

  it('edits an existing rule with its id and prefilled values', async () => {
    const saveCategoryRule = vi.fn(async () => true);
    renderWithLens(<RulesPage />, { rules: [makeRule()], saveCategoryRule });

    clickHost(actionButton('编辑分类规则'));
    expect(document.querySelector('m-dialog[headline="编辑分类规则"]')).not.toBeNull();
    expect((document.querySelector('m-text-field[label="规则名称"]') as { value?: string }).value).toBe(
      '咖啡关键词',
    );

    fireDetail(field('规则名称'), 'input', { value: '改名后的规则' });
    clickHost(materialButton('保存规则'));
    await waitFor(() =>
      expect(saveCategoryRule).toHaveBeenCalledWith({
        id: 'rule-1',
        name: '改名后的规则',
        pattern: '星巴克',
        category: '餐饮',
        enabled: true,
      }),
    );
  });

  it('confirms before deleting a rule', async () => {
    const deleteCategoryRule = vi.fn(async () => true);
    const { confirm } = renderWithLens(<RulesPage />, {
      rules: [makeRule()],
      deleteCategoryRule,
    });

    clickHost(actionButton('删除分类规则'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deleteCategoryRule).toHaveBeenCalledWith('rule-1'));
  });

  it('shows an empty state that opens the create dialog', () => {
    renderWithLens(<RulesPage />, { rules: [] });
    expect(document.body.textContent).toContain('还没有分类规则');
    clickHost(materialButton('创建第一条规则'));
    expect(document.querySelector('m-dialog[headline="新建分类规则"]')).not.toBeNull();
  });
});
