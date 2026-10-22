import { invoke } from '@tauri-apps/api/core';
import type { ImportReport, DashboardData, DatabaseInfo, ImportBatch, Transaction, CategoryRule } from '../types';

export const api = {
  databaseInfo: () => invoke<DatabaseInfo>('get_database_info'),
  transactions: (limit = 500, offset = 0) => invoke<Transaction[]>('get_transactions', { limit, offset }),
  dashboard: (start: string, end: string, source = 'all', category = 'all') => invoke<DashboardData>('get_dashboard', { start, end, source, category }),
  batches: () => invoke<ImportBatch[]>('get_batches'),
  categoryRules: () => invoke<CategoryRule[]>('get_category_rules'),
  saveCategoryRule: (input:{name:string;pattern:string;category:string;enabled:boolean}) => invoke<CategoryRule>('save_category_rule',{input}),
  deleteCategoryRule: (id:string) => invoke<void>('delete_category_rule',{id}),
  importTransactions: (filename: string, source: string, transactions: Transaction[]) =>
    invoke<ImportReport>('import_transactions', { filename, source, transactions }),
  importFiles: (files: { filename: string; source: string; transactions: Transaction[]; duplicateDecisions:{candidateId:string|null;incomingJson:string;certainty:string;reason:string;decision:string}[] }[]) =>
    invoke<ImportReport[]>('import_files', { files }),
  updateTransaction: (id: string, update: { category: string; kind: string; included: boolean }) =>
    invoke<void>('update_transaction', { id, update }),
  undoBatch: (batchId: string) => invoke<number>('undo_batch', { batchId }),
  backup: (destination: string) => invoke<void>('backup_database', { destination }),
  restore: (source: string, mode: 'merge' | 'replace') => invoke<{ inserted: number; conflicts: number; replaced: boolean }>('restore_database', { source, mode }),
  restoreJson: (source: string, mode: 'merge' | 'replace') => invoke<{ inserted: number; conflicts: number; replaced: boolean }>('restore_json', { source, mode }),
  migrate: (destination: string) => invoke<DatabaseInfo>('migrate_database', { destination }),
  exportJson: (destination: string) => invoke<void>('export_json', { destination }),
  exportCsv: (destination: string, start: string, end: string, source='all', category='all', kind='all') => invoke<void>('export_csv', { destination, start, end, source, category, kind }),
  clear: () => invoke<void>('clear_database'),
};
