export type Source = 'wechat' | 'alipay' | 'other';
export type TransactionKind = 'expense' | 'income' | 'transfer' | 'refund' | 'cancelled' | 'pending';

export interface Transaction {
  id: string;
  source: Source;
  platformId: string | null;
  occurredAt: string;
  amountCents: number;
  kind: TransactionKind;
  direction: string;
  merchant: string;
  description: string;
  paymentMethod: string;
  rawCategory: string;
  category: string;
  status: string;
  linkedTransactionId: string | null;
  included: boolean;
  exclusionReason: string | null;
  ruleReason: string;
  batchId: string;
  rawJson: string;
  fingerprint: string;
  manuallyModified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedRow { transaction: Transaction; rowNumber: number }
export interface ParseIssue { rowNumber: number; reason: string; raw: Record<string, string> }
export interface ParseResult {
  source: Source;
  headers: string[];
  parsed: ParsedRow[];
  issues: ParseIssue[];
  rowCount: number;
  mappingNeeded: boolean;
  mapping: Record<string, number>;
  filename: string;
}
export interface ImportBatch {
  id: string; filename: string; source: string; importedAt: string;
  addedCount: number; duplicateCount: number; excludedCount: number; undone: boolean;
}
export interface CategoryRule { id:string;name:string;pattern:string;category:string;priority:number;enabled:boolean;createdAt:string }
export interface CategoryRuleInput { id?: string; name: string; pattern: string; category: string; enabled: boolean }
export interface DatabaseInfo { path: string; transactionCount: number; schemaVersion: number; sizeBytes: number }
export interface DashboardData {
  totalExpenseCents: number; totalIncomeCents: number; refundCents: number;
  netExpenseCents: number; transactionCount: number; pendingCount: number;
  categoryTotals: { category: string; amountCents: number }[];
  dailyTotals: { day: string; expenseCents: number; incomeCents: number }[];
  merchantTotals: { merchant: string; amountCents: number }[];
  monthlyTotals: { month: string; expenseCents: number; incomeCents: number }[];
}
export interface ImportReport { added: number; duplicates: number; batch: ImportBatch }
