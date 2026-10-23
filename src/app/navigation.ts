import {
  Database,
  FolderCog,
  LayoutDashboard,
  ReceiptText,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export type PageId = 'dashboard' | 'transactions' | 'imports' | 'rules' | 'data';

export interface PageDefinition {
  id: PageId;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const PAGES: PageDefinition[] = [
  {
    id: 'dashboard',
    label: '概览',
    title: '概览',
    description: '本期收支结构、趋势与需要留意的本地交易。',
    icon: LayoutDashboard,
  },
  {
    id: 'transactions',
    label: '交易明细',
    title: '交易明细',
    description: '在本地搜索、筛选并修正交易记录，金额与状态沿用现有统计口径。',
    icon: ReceiptText,
  },
  {
    id: 'imports',
    label: '账单导入',
    title: '账单导入',
    description: '在本机解析微信 XLSX 或支付宝 CSV 账单，确认字段与重复项后再写入数据库。',
    icon: Upload,
  },
  {
    id: 'rules',
    label: '分类规则',
    title: '分类规则',
    description: '用关键词规则改善后续导入的分类；不会回溯修改已有交易。',
    icon: FolderCog,
  },
  {
    id: 'data',
    label: '数据管理',
    title: '数据管理',
    description: '查看本地数据库状态，完成备份、恢复、导出与导入批次撤销。',
    icon: Database,
  },
];

export function pageById(id: PageId): PageDefinition {
  return PAGES.find((page) => page.id === id) ?? PAGES[0]!;
}

export function isPageId(value: string): value is PageId {
  return PAGES.some((page) => page.id === value);
}
