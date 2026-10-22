mod store;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState(Mutex<store::Database>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub source: String,
    pub platform_id: Option<String>,
    pub occurred_at: String,
    pub amount_cents: i64,
    pub kind: String,
    pub direction: String,
    pub merchant: String,
    pub description: String,
    pub payment_method: String,
    pub raw_category: String,
    pub category: String,
    pub status: String,
    pub linked_transaction_id: Option<String>,
    pub included: bool,
    pub exclusion_reason: Option<String>,
    pub rule_reason: String,
    pub batch_id: String,
    pub raw_json: String,
    pub fingerprint: String,
    pub manually_modified: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatch {
    pub id: String,
    pub filename: String,
    pub source: String,
    pub imported_at: String,
    pub added_count: usize,
    pub duplicate_count: usize,
    pub excluded_count: usize,
    #[serde(default)]
    pub undone: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportResult {
    pub added: usize,
    pub duplicates: usize,
    pub batch: ImportBatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub filename: String,
    pub source: String,
    pub transactions: Vec<Transaction>,
    #[serde(default)]
    pub duplicate_decisions: Vec<DuplicateDecisionInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateDecisionInput {
    pub candidate_id: Option<String>,
    pub incoming_json: String,
    pub certainty: String,
    pub reason: String,
    pub decision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub transaction_count: usize,
    pub schema_version: i64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub total_expense_cents: i64,
    pub total_income_cents: i64,
    pub refund_cents: i64,
    pub net_expense_cents: i64,
    pub transaction_count: usize,
    pub pending_count: usize,
    pub category_totals: Vec<CategoryTotal>,
    pub daily_totals: Vec<DailyTotal>,
    pub merchant_totals: Vec<MerchantTotal>,
    pub monthly_totals: Vec<MonthlyTotal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category: String,
    pub amount_cents: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTotal {
    pub day: String,
    pub expense_cents: i64,
    pub income_cents: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MerchantTotal {
    pub merchant: String,
    pub amount_cents: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyTotal {
    pub month: String,
    pub expense_cents: i64,
    pub income_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionUpdate {
    pub category: String,
    pub kind: String,
    pub included: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub category: String,
    pub priority: i64,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRuleInput {
    pub name: String,
    pub pattern: String,
    pub category: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub inserted: usize,
    pub conflicts: usize,
    pub replaced: bool,
}

fn lock_db<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, store::Database>, String> {
    state
        .0
        .lock()
        .map_err(|_| "数据库连接暂不可用，请重启应用后重试。".to_string())
}

#[tauri::command]
fn get_database_info(state: State<'_, AppState>) -> Result<DatabaseInfo, String> {
    lock_db(&state)?.info().map_err(|e| e.user_message())
}

#[tauri::command]
fn get_transactions(
    state: State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> Result<Vec<Transaction>, String> {
    lock_db(&state)?
        .transactions(limit.min(500), offset)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn get_dashboard(
    state: State<'_, AppState>,
    start: String,
    end: String,
    source: String,
    category: String,
) -> Result<DashboardData, String> {
    lock_db(&state)?
        .dashboard(&start, &end, &source, &category)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn get_batches(state: State<'_, AppState>) -> Result<Vec<ImportBatch>, String> {
    lock_db(&state)?.batches().map_err(|e| e.user_message())
}

#[tauri::command]
fn get_category_rules(state: State<'_, AppState>) -> Result<Vec<CategoryRule>, String> {
    lock_db(&state)?
        .category_rules()
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn save_category_rule(
    state: State<'_, AppState>,
    input: CategoryRuleInput,
) -> Result<CategoryRule, String> {
    lock_db(&state)?
        .save_category_rule(input)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn delete_category_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    lock_db(&state)?
        .delete_category_rule(&id)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn import_transactions(
    state: State<'_, AppState>,
    filename: String,
    source: String,
    mut transactions: Vec<Transaction>,
) -> Result<BatchImportResult, String> {
    if transactions.is_empty() {
        return Err("没有可导入的有效交易。".into());
    }
    let batch_id = Uuid::new_v4().to_string();
    for tx in &mut transactions {
        tx.batch_id = batch_id.clone();
    }
    lock_db(&state)?
        .import_batch(&filename, &source, &batch_id, transactions)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn import_files(
    state: State<'_, AppState>,
    files: Vec<ImportFile>,
) -> Result<Vec<BatchImportResult>, String> {
    if files.is_empty() {
        return Err("没有可导入的有效交易。".into());
    }
    lock_db(&state)?
        .import_files(files)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn update_transaction(
    state: State<'_, AppState>,
    id: String,
    update: TransactionUpdate,
) -> Result<(), String> {
    lock_db(&state)?
        .update_transaction(&id, update)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn undo_batch(state: State<'_, AppState>, batch_id: String) -> Result<usize, String> {
    lock_db(&state)?
        .undo_batch(&batch_id)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn backup_database(state: State<'_, AppState>, destination: String) -> Result<(), String> {
    lock_db(&state)?
        .backup_to(Path::new(&destination))
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn restore_database(
    state: State<'_, AppState>,
    source: String,
    mode: String,
) -> Result<RestoreResult, String> {
    if mode != "merge" && mode != "replace" {
        return Err("请选择合并或完整替换恢复方式。".into());
    }
    lock_db(&state)?
        .restore_from(Path::new(&source), mode == "replace")
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn migrate_database(
    state: State<'_, AppState>,
    destination: String,
) -> Result<DatabaseInfo, String> {
    let path = PathBuf::from(destination);
    lock_db(&state)?
        .move_to(&path)
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn export_json(state: State<'_, AppState>, destination: String) -> Result<(), String> {
    lock_db(&state)?
        .export_json(Path::new(&destination))
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn restore_json(
    state: State<'_, AppState>,
    source: String,
    mode: String,
) -> Result<RestoreResult, String> {
    if mode != "merge" && mode != "replace" {
        return Err("请选择合并或完整替换恢复方式。".into());
    }
    lock_db(&state)?
        .restore_json(Path::new(&source), mode == "replace")
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn export_csv(
    state: State<'_, AppState>,
    destination: String,
    start: String,
    end: String,
    source: String,
    category: String,
    kind: String,
) -> Result<(), String> {
    lock_db(&state)?
        .export_csv(
            Path::new(&destination),
            &start,
            &end,
            &source,
            &category,
            &kind,
        )
        .map_err(|e| e.user_message())
}

#[tauri::command]
fn clear_database(state: State<'_, AppState>) -> Result<(), String> {
    lock_db(&state)?.clear().map_err(|e| e.user_message())
}

fn app_database_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位系统用户数据目录。")?;
    fs::create_dir_all(&base).map_err(|_| "无法创建应用数据目录，请检查磁盘和文件权限。")?;
    let config = base.join("database-location.json");
    if let Ok(value) = fs::read_to_string(&config) {
        let saved = serde_json::from_str::<String>(&value)
            .map_err(|_| "数据库位置配置无效，请联系支持人员。".to_string())?;
        let path = PathBuf::from(saved);
        if !path.exists() {
            return Err(
                "找不到已设置的数据库文件。请恢复备份或重新连接数据库位置，应用不会自动创建空库。"
                    .into(),
            );
        }
        return Ok((path, config));
    }
    Ok((base.join("expenses.db"), config))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (path, config_path) =
                app_database_paths(app.handle()).map_err(std::io::Error::other)?;
            let db = store::Database::open(path, config_path)
                .map_err(|e| std::io::Error::other(e.user_message()))?;
            app.manage(AppState(Mutex::new(db)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_database_info,
            get_transactions,
            get_dashboard,
            get_batches,
            get_category_rules,
            save_category_rule,
            delete_category_rule,
            import_transactions,
            import_files,
            update_transaction,
            undo_batch,
            backup_database,
            restore_database,
            migrate_database,
            export_json,
            restore_json,
            export_csv,
            clear_database
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Expense Lens");
}
