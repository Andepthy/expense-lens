use crate::{
    BatchImportResult, CategoryRule, CategoryRuleInput, CategoryTotal, DailyTotal, DashboardData,
    DatabaseInfo, ImportBatch, ImportFile, MerchantTotal, MonthlyTotal, RestoreResult, Transaction,
    TransactionUpdate,
};
use rusqlite::{backup::Backup, params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;

const SCHEMA_VERSION: i64 = 1;

#[derive(Deserialize)]
struct JsonEnvelope {
    schema_version: i64,
    #[serde(default)]
    transactions: Vec<Transaction>,
    #[serde(default)]
    batches: Vec<ImportBatch>,
    #[serde(default)]
    categories: Vec<(String, String, String, bool)>,
    #[serde(default)]
    rules: Vec<(String, String, String, String, i64, bool, String)>,
    #[serde(default)]
    duplicates: Vec<(
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        String,
    )>,
    #[serde(default)]
    audit: Vec<(
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        String,
    )>,
}

#[derive(Debug)]
pub struct DbError(String);

impl DbError {
    pub fn user_message(&self) -> String {
        let msg = self.0.to_lowercase();
        if msg.contains("database disk image is malformed")
            || msg.contains("not a database")
            || msg.contains("integrity_check")
        {
            "数据库文件损坏或格式无效。请从备份恢复，原文件已保留。".into()
        } else if msg.contains("disk is full")
            || msg.contains("no space")
            || msg.contains("disk i/o")
        {
            "磁盘空间不足或磁盘暂不可写。请释放空间后重试。".into()
        } else if msg.contains("permission denied")
            || msg.contains("access is denied")
            || msg.contains("readonly")
        {
            "没有访问该数据库路径的权限，请选择可写目录。".into()
        } else if msg.contains("schema") || msg.contains("user_version") {
            "数据库版本不兼容，未更改现有数据。".into()
        } else if msg.contains("busy") || msg.contains("locked") {
            "数据库正被占用，请稍后重试。".into()
        } else {
            "数据库操作失败，未确认的数据更改已回滚。请检查磁盘空间与文件权限后重试。".into()
        }
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(value: rusqlite::Error) -> Self {
        Self(value.to_string())
    }
}
impl From<std::io::Error> for DbError {
    fn from(value: std::io::Error) -> Self {
        Self(value.to_string())
    }
}
impl From<serde_json::Error> for DbError {
    fn from(value: serde_json::Error) -> Self {
        Self(value.to_string())
    }
}

pub struct Database {
    conn: Connection,
    path: PathBuf,
    location_file: PathBuf,
}

impl Database {
    pub fn open(path: PathBuf, location_file: PathBuf) -> Result<Self, DbError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(&path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        Self::migrate(&conn)?;
        Ok(Self {
            conn,
            path,
            location_file,
        })
    }

    fn migrate(conn: &Connection) -> Result<(), DbError> {
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(DbError("schema version newer".into()));
        }
        if version < 1 {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))?;
            tx.commit()?;
        }
        Ok(())
    }

    pub fn info(&self) -> Result<DatabaseInfo, DbError> {
        let transaction_count: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
        let schema_version: i64 = self
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))?;
        let size_bytes = [
            self.path.clone(),
            PathBuf::from(format!("{}-wal", self.path.display())),
            PathBuf::from(format!("{}-shm", self.path.display())),
        ]
        .iter()
        .filter_map(|path| fs::metadata(path).ok().map(|meta| meta.len()))
        .sum();
        Ok(DatabaseInfo {
            path: self.path.to_string_lossy().into_owned(),
            transaction_count: transaction_count as usize,
            schema_version,
            size_bytes,
        })
    }

    pub fn transactions(&self, limit: usize, offset: usize) -> Result<Vec<Transaction>, DbError> {
        let mut stmt = self.conn.prepare("SELECT id,source,platform_id,occurred_at,amount_cents,kind,direction,merchant,description,payment_method,raw_category,category,status,linked_transaction_id,included,exclusion_reason,rule_reason,batch_id,raw_json,fingerprint,manually_modified,created_at,updated_at FROM transactions ORDER BY occurred_at DESC LIMIT ?1 OFFSET ?2")?;
        let rows = stmt.query_map(params![limit as i64, offset as i64], map_transaction)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn batches(&self) -> Result<Vec<ImportBatch>, DbError> {
        let mut stmt = self.conn.prepare("SELECT id,filename,source,imported_at,added_count,duplicate_count,excluded_count FROM import_batches WHERE undone=0 ORDER BY imported_at DESC")?;
        let rows = stmt.query_map([], |r| {
            Ok(ImportBatch {
                id: r.get(0)?,
                filename: r.get(1)?,
                source: r.get(2)?,
                imported_at: r.get(3)?,
                added_count: r.get::<_, i64>(4)? as usize,
                duplicate_count: r.get::<_, i64>(5)? as usize,
                excluded_count: r.get::<_, i64>(6)? as usize,
                undone: false,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn category_rules(&self) -> Result<Vec<CategoryRule>, DbError> {
        let mut stmt=self.conn.prepare("SELECT id,name,pattern,category,priority,enabled,created_at FROM category_rules ORDER BY priority DESC,created_at DESC")?;
        let rows = stmt.query_map([], |r| {
            Ok(CategoryRule {
                id: r.get(0)?,
                name: r.get(1)?,
                pattern: r.get(2)?,
                category: r.get(3)?,
                priority: r.get(4)?,
                enabled: r.get::<_, i32>(5)? != 0,
                created_at: r.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save_category_rule(
        &mut self,
        input: CategoryRuleInput,
    ) -> Result<CategoryRule, DbError> {
        if input.pattern.trim().is_empty() || input.category.trim().is_empty() {
            return Err(DbError("invalid category rule".into()));
        }
        let rule = CategoryRule {
            id: Uuid::new_v4().to_string(),
            name: input.name.trim().to_string(),
            pattern: input.pattern.trim().to_string(),
            category: input.category,
            priority: 0,
            enabled: input.enabled,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        self.conn.execute("INSERT INTO category_rules(id,name,pattern,category,priority,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![rule.id,rule.name,rule.pattern,rule.category,rule.priority,rule.enabled as i32,rule.created_at])?;
        Ok(rule)
    }

    pub fn delete_category_rule(&mut self, id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM category_rules WHERE id=?1", [id])?;
        Ok(())
    }

    pub fn import_batch(
        &mut self,
        filename: &str,
        source: &str,
        batch_id: &str,
        transactions: Vec<Transaction>,
    ) -> Result<BatchImportResult, DbError> {
        let _ = batch_id;
        let mut result = self.import_files(vec![ImportFile {
            filename: filename.into(),
            source: source.into(),
            transactions,
            duplicate_decisions: Vec::new(),
        }])?;
        result
            .pop()
            .ok_or_else(|| DbError("batch import produced no result".into()))
    }

    pub fn import_files(
        &mut self,
        files: Vec<ImportFile>,
    ) -> Result<Vec<BatchImportResult>, DbError> {
        let tx = self.conn.transaction()?;
        let mut results = Vec::new();
        for file in files {
            let batch_id = Uuid::new_v4().to_string();
            let imported_at = chrono::Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO import_batches(id,filename,source,imported_at) VALUES (?1,?2,?3,?4)",
                params![batch_id, file.filename, file.source, imported_at],
            )?;
            let mut added = 0usize;
            let mut duplicates = 0usize;
            let mut excluded = 0usize;
            for decision in &file.duplicate_decisions {
                if decision.decision == "skipped" {
                    duplicates += 1;
                }
                tx.execute("INSERT INTO duplicate_decisions(id,batch_id,candidate_id,incoming_json,certainty,reason,decision,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![Uuid::new_v4().to_string(),batch_id,decision.candidate_id,decision.incoming_json,decision.certainty,decision.reason,decision.decision,chrono::Utc::now().to_rfc3339()])?;
            }
            for mut item in file.transactions {
                item.batch_id = batch_id.clone();
                if item.kind == "refund" && item.linked_transaction_id.is_none() {
                    let mut stmt=tx.prepare("SELECT id FROM transactions WHERE source=?1 AND kind='expense' AND amount_cents=?2 AND merchant=?3 AND date(substr(occurred_at,1,10))<=date(substr(?4,1,10)) AND date(substr(occurred_at,1,10))>=date(substr(?4,1,10),'-45 day') ORDER BY occurred_at DESC LIMIT 2")?;
                    let candidates = stmt
                        .query_map(
                            params![
                                item.source,
                                item.amount_cents,
                                item.merchant,
                                item.occurred_at
                            ],
                            |r| r.get::<_, String>(0),
                        )?
                        .collect::<Result<Vec<_>, _>>()?;
                    if candidates.len() == 1 {
                        item.linked_transaction_id = candidates.first().cloned();
                        item.included = true;
                        item.rule_reason.push_str("；与本地唯一匹配消费关联");
                    } else {
                        item.included = false;
                        item.exclusion_reason = Some("未匹配退款，待确认关联".into());
                        item.rule_reason
                            .push_str("；本地账本中没有唯一匹配消费，待人工确认");
                    }
                }
                if !item.manually_modified {
                    let normalized =
                        format!("{} {}", item.merchant, item.description).to_lowercase();
                    let mut rules=tx.prepare("SELECT category,pattern FROM category_rules WHERE enabled=1 ORDER BY priority DESC,created_at DESC")?;
                    let available = rules
                        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                        .collect::<Result<Vec<_>, _>>()?;
                    if let Some((category, pattern)) = available.into_iter().find(|(_, pattern)| {
                        !pattern.trim().is_empty() && normalized.contains(&pattern.to_lowercase())
                    }) {
                        item.category = category.clone();
                        item.rule_reason =
                            format!("自定义规则命中关键词“{pattern}”，归入{category}");
                    }
                }
                let by_platform: Option<String> = item
                    .platform_id
                    .as_deref()
                    .filter(|v| !v.is_empty())
                    .map(|platform_id| {
                        tx.query_row(
                            "SELECT id FROM transactions WHERE source=?1 AND platform_id=?2",
                            params![item.source, platform_id],
                            |r| r.get(0),
                        )
                        .optional()
                    })
                    .transpose()?
                    .flatten();
                let by_fingerprint: Option<String> = if by_platform.is_none()
                    && item.platform_id.as_deref().unwrap_or("").is_empty()
                    && !item.fingerprint.is_empty()
                {
                    tx.query_row("SELECT id FROM transactions WHERE source=?1 AND (platform_id IS NULL OR platform_id='') AND fingerprint=?2 AND occurred_at=?3 AND amount_cents=?4 AND merchant=?5 LIMIT 1", params![item.source,item.fingerprint,item.occurred_at,item.amount_cents,item.merchant], |r| r.get(0)).optional()?
                } else {
                    None
                };
                if let Some(candidate_id) = by_platform.or(by_fingerprint) {
                    duplicates += 1;
                    tx.execute("INSERT INTO duplicate_decisions(id,batch_id,candidate_id,incoming_json,certainty,reason,created_at) VALUES (?1,?2,?3,?4,'certain','相同来源交易单号或完全匹配的规范化指纹',?5)", params![Uuid::new_v4().to_string(),batch_id,candidate_id,item.raw_json,chrono::Utc::now().to_rfc3339()])?;
                    continue;
                }
                if item.kind == "expense" && !item.included {
                    excluded += 1;
                }
                tx.execute("INSERT INTO transactions(id,source,platform_id,occurred_at,amount_cents,kind,direction,merchant,description,payment_method,raw_category,category,status,linked_transaction_id,included,exclusion_reason,rule_reason,batch_id,raw_json,fingerprint,manually_modified,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)", params![item.id,item.source,item.platform_id,item.occurred_at,item.amount_cents,item.kind,item.direction,item.merchant,item.description,item.payment_method,item.raw_category,item.category,item.status,item.linked_transaction_id,item.included as i32,item.exclusion_reason,item.rule_reason,batch_id,item.raw_json,item.fingerprint,item.manually_modified as i32,item.created_at,item.updated_at])?;
                added += 1;
                if item.kind == "expense" {
                    let mut stmt=tx.prepare("SELECT id FROM transactions WHERE source=?1 AND kind='refund' AND linked_transaction_id IS NULL AND amount_cents=?2 AND merchant=?3 AND date(substr(occurred_at,1,10))>=date(substr(?4,1,10)) AND date(substr(occurred_at,1,10))<=date(substr(?4,1,10),'+45 day') ORDER BY occurred_at LIMIT 2")?;
                    let refunds = stmt
                        .query_map(
                            params![
                                item.source,
                                item.amount_cents,
                                item.merchant,
                                item.occurred_at
                            ],
                            |r| r.get::<_, String>(0),
                        )?
                        .collect::<Result<Vec<_>, _>>()?;
                    if refunds.len() == 1 {
                        tx.execute("UPDATE transactions SET linked_transaction_id=?1,included=1,exclusion_reason=NULL,rule_reason=rule_reason||'；后续账单中找到唯一原消费',updated_at=?2 WHERE id=?3",params![item.id,chrono::Utc::now().to_rfc3339(),refunds[0]])?;
                    }
                }
            }
            tx.execute("UPDATE import_batches SET added_count=?1,duplicate_count=?2,excluded_count=?3 WHERE id=?4", params![added as i64,duplicates as i64,excluded as i64,batch_id])?;
            let batch = ImportBatch {
                id: batch_id,
                filename: file.filename,
                source: file.source,
                imported_at,
                added_count: added,
                duplicate_count: duplicates,
                excluded_count: excluded,
                undone: false,
            };
            results.push(BatchImportResult {
                added,
                duplicates,
                batch,
            });
        }
        tx.commit()?;
        Ok(results)
    }

    pub fn update_transaction(
        &mut self,
        id: &str,
        update: TransactionUpdate,
    ) -> Result<(), DbError> {
        let tx = self.conn.transaction()?;
        let before: Option<Transaction> = tx.query_row("SELECT id,source,platform_id,occurred_at,amount_cents,kind,direction,merchant,description,payment_method,raw_category,category,status,linked_transaction_id,included,exclusion_reason,rule_reason,batch_id,raw_json,fingerprint,manually_modified,created_at,updated_at FROM transactions WHERE id=?1", [id], map_transaction).optional()?;
        let Some(before) = before else {
            return Err(DbError("transaction not found".into()));
        };
        let before_json = serde_json::to_string(&before)?;
        tx.execute("UPDATE transactions SET category=?1,kind=?2,included=?3,exclusion_reason=CASE WHEN ?3=1 THEN NULL ELSE COALESCE(exclusion_reason,'用户手动排除统计') END,rule_reason=rule_reason||'；用户手动修改分类、类型或统计状态',manually_modified=1,updated_at=?4 WHERE id=?5", params![update.category,update.kind,update.included as i32,chrono::Utc::now().to_rfc3339(),id])?;
        let after: Transaction = tx.query_row("SELECT id,source,platform_id,occurred_at,amount_cents,kind,direction,merchant,description,payment_method,raw_category,category,status,linked_transaction_id,included,exclusion_reason,rule_reason,batch_id,raw_json,fingerprint,manually_modified,created_at,updated_at FROM transactions WHERE id=?1", [id], map_transaction)?;
        tx.execute("INSERT INTO audit_log(id,entity_id,action,before_json,after_json,occurred_at) VALUES (?1,?2,'update',?3,?4,?5)", params![Uuid::new_v4().to_string(),id,before_json,serde_json::to_string(&after)?,chrono::Utc::now().to_rfc3339()])?;
        tx.commit()?;
        Ok(())
    }

    pub fn undo_batch(&mut self, batch_id: &str) -> Result<usize, DbError> {
        let tx = self.conn.transaction()?;
        tx.execute("UPDATE transactions SET linked_transaction_id=NULL,included=0,exclusion_reason='关联的原消费已撤销，退款待重新确认',updated_at=?1 WHERE linked_transaction_id IN (SELECT id FROM transactions WHERE batch_id=?2) AND batch_id<>?2", params![chrono::Utc::now().to_rfc3339(),batch_id])?;
        let count = tx.execute("DELETE FROM transactions WHERE batch_id=?1", [batch_id])?;
        tx.execute(
            "DELETE FROM duplicate_decisions WHERE batch_id=?1",
            [batch_id],
        )?;
        tx.execute("UPDATE import_batches SET undone=1 WHERE id=?1", [batch_id])?;
        tx.commit()?;
        Ok(count)
    }

    pub fn dashboard(
        &self,
        start: &str,
        end: &str,
        source: &str,
        category: &str,
    ) -> Result<DashboardData, DbError> {
        let (total_expense_cents,total_income_cents,refund_cents,linked_refund_cents,transaction_count,pending_count): (i64,i64,i64,i64,i64,i64) = self.conn.query_row(
          "SELECT COALESCE(SUM(CASE WHEN kind='expense' AND included=1 THEN amount_cents ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='income' AND included=1 THEN amount_cents ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='refund' THEN amount_cents ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='refund' AND included=1 AND linked_transaction_id IS NOT NULL THEN amount_cents ELSE 0 END),0), COUNT(*), SUM(CASE WHEN kind='pending' OR (kind='refund' AND linked_transaction_id IS NULL) THEN 1 ELSE 0 END) FROM transactions WHERE substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4)", params![start,end,source,category], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get::<_,Option<i64>>(5)?.unwrap_or(0)))
        )?;
        let net_expense_cents = total_expense_cents - linked_refund_cents;
        let mut category_totals = Vec::new();
        let mut stmt=self.conn.prepare("SELECT category,SUM(amount_cents) FROM transactions WHERE kind='expense' AND included=1 AND substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4) GROUP BY category ORDER BY SUM(amount_cents) DESC")?;
        for row in stmt.query_map(params![start, end, source, category], |r| {
            Ok(CategoryTotal {
                category: r.get(0)?,
                amount_cents: r.get(1)?,
            })
        })? {
            category_totals.push(row?);
        }
        let mut daily_totals = Vec::new();
        let mut stmt=self.conn.prepare("SELECT substr(occurred_at,1,10),SUM(CASE WHEN kind='expense' AND included=1 THEN amount_cents ELSE 0 END),SUM(CASE WHEN kind='income' AND included=1 THEN amount_cents ELSE 0 END) FROM transactions WHERE substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4) GROUP BY substr(occurred_at,1,10) ORDER BY 1")?;
        for row in stmt.query_map(params![start, end, source, category], |r| {
            Ok(DailyTotal {
                day: r.get(0)?,
                expense_cents: r.get(1)?,
                income_cents: r.get(2)?,
            })
        })? {
            daily_totals.push(row?);
        }
        let mut merchant_totals = Vec::new();
        let mut stmt=self.conn.prepare("SELECT merchant,SUM(amount_cents) FROM transactions WHERE kind='expense' AND included=1 AND substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4) GROUP BY merchant ORDER BY SUM(amount_cents) DESC LIMIT 8")?;
        for row in stmt.query_map(params![start, end, source, category], |r| {
            Ok(MerchantTotal {
                merchant: r.get(0)?,
                amount_cents: r.get(1)?,
            })
        })? {
            merchant_totals.push(row?);
        }
        let mut monthly_totals = Vec::new();
        let mut stmt=self.conn.prepare("SELECT substr(occurred_at,1,7),SUM(CASE WHEN kind='expense' AND included=1 THEN amount_cents ELSE 0 END),SUM(CASE WHEN kind='income' AND included=1 THEN amount_cents ELSE 0 END) FROM transactions WHERE substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4) GROUP BY substr(occurred_at,1,7) ORDER BY 1")?;
        for row in stmt.query_map(params![start, end, source, category], |r| {
            Ok(MonthlyTotal {
                month: r.get(0)?,
                expense_cents: r.get(1)?,
                income_cents: r.get(2)?,
            })
        })? {
            monthly_totals.push(row?);
        }
        Ok(DashboardData {
            total_expense_cents,
            total_income_cents,
            refund_cents,
            net_expense_cents,
            transaction_count: transaction_count as usize,
            pending_count: pending_count as usize,
            category_totals,
            daily_totals,
            merchant_totals,
            monthly_totals,
        })
    }

    pub fn backup_to(&self, destination: &Path) -> Result<(), DbError> {
        if same_path(destination, &self.path) {
            return Err(DbError("backup destination equals current database".into()));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = Connection::open(destination)?;
        let backup = Backup::new(&self.conn, &mut out)?;
        backup.run_to_completion(64, Duration::from_millis(10), None)?;
        drop(backup);
        out.pragma_update(None, "journal_mode", "DELETE")?;
        Ok(())
    }

    pub fn restore_from(&mut self, source: &Path, replace: bool) -> Result<RestoreResult, DbError> {
        if same_path(source, &self.path) {
            return Err(DbError("restore source equals current database".into()));
        }
        let incoming = Connection::open(source)?;
        let integrity: String = incoming.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            return Err(DbError("integrity_check failed".into()));
        }
        let version: i64 = incoming.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version < 1 || version > SCHEMA_VERSION {
            return Err(DbError("unsupported schema version".into()));
        }
        drop(incoming);
        self.conn.execute(
            "ATTACH DATABASE ?1 AS incoming",
            [source.to_string_lossy().as_ref()],
        )?;
        let result: Result<RestoreResult, DbError> = (|| {
            let tx = self.conn.transaction()?;
            let existing_count: i64 =
                tx.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
            if replace {
                tx.execute_batch("DELETE FROM duplicate_decisions; DELETE FROM audit_log; DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM categories; DELETE FROM import_batches;")?;
            }
            let mut conflicts = 0usize;
            for table in [
                "categories",
                "import_batches",
                "transactions",
                "category_rules",
                "duplicate_decisions",
                "audit_log",
            ] {
                let sql = if replace {
                    format!("INSERT INTO main.{table} SELECT * FROM incoming.{table}")
                } else {
                    format!("INSERT OR IGNORE INTO main.{table} SELECT * FROM incoming.{table}")
                };
                let changed = tx.execute(&sql, [])?;
                if table == "transactions" && !replace {
                    let incoming_count: i64 =
                        tx.query_row("SELECT COUNT(*) FROM incoming.transactions", [], |r| {
                            r.get(0)
                        })?;
                    conflicts = incoming_count.saturating_sub(changed as i64).max(0) as usize;
                }
            }
            let final_count: i64 =
                tx.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
            tx.commit()?;
            Ok(RestoreResult {
                inserted: if replace {
                    final_count.max(0) as usize
                } else {
                    final_count.saturating_sub(existing_count).max(0) as usize
                },
                conflicts,
                replaced: replace,
            })
        })();
        let detach = self.conn.execute("DETACH DATABASE incoming", []);
        let restored = result?;
        detach?;
        let _ = self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []);
        Ok(restored)
    }

    pub fn restore_json(&mut self, source: &Path, replace: bool) -> Result<RestoreResult, DbError> {
        let bytes = fs::read(source)?;
        let envelope: JsonEnvelope = serde_json::from_slice(&bytes)?;
        if envelope.schema_version < 1 || envelope.schema_version > SCHEMA_VERSION {
            return Err(DbError("unsupported schema version".into()));
        }
        let tx = self.conn.transaction()?;
        let before: i64 = tx.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
        if replace {
            tx.execute_batch("DELETE FROM duplicate_decisions; DELETE FROM audit_log; DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM categories; DELETE FROM import_batches;")?;
        }
        if !envelope.categories.is_empty() {
            let sql = if replace {
                "INSERT INTO categories(id,name,color,builtin) VALUES (?1,?2,?3,?4)"
            } else {
                "INSERT OR IGNORE INTO categories(id,name,color,builtin) VALUES (?1,?2,?3,?4)"
            };
            for row in &envelope.categories {
                tx.execute(sql, params![row.0, row.1, row.2, row.3 as i32])?;
            }
        }
        for b in &envelope.batches {
            tx.execute("INSERT OR IGNORE INTO import_batches(id,filename,source,imported_at,added_count,duplicate_count,excluded_count,undone) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![b.id,b.filename,b.source,b.imported_at,b.added_count as i64,b.duplicate_count as i64,b.excluded_count as i64,b.undone as i32])?;
        }
        let mut conflicts = 0;
        for item in &envelope.transactions {
            let changed=tx.execute("INSERT OR IGNORE INTO transactions(id,source,platform_id,occurred_at,amount_cents,kind,direction,merchant,description,payment_method,raw_category,category,status,linked_transaction_id,included,exclusion_reason,rule_reason,batch_id,raw_json,fingerprint,manually_modified,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",params![item.id,item.source,item.platform_id,item.occurred_at,item.amount_cents,item.kind,item.direction,item.merchant,item.description,item.payment_method,item.raw_category,item.category,item.status,item.linked_transaction_id,item.included as i32,item.exclusion_reason,item.rule_reason,item.batch_id,item.raw_json,item.fingerprint,item.manually_modified as i32,item.created_at,item.updated_at])?;
            if changed == 0 {
                conflicts += 1;
            }
        }
        for r in &envelope.rules {
            tx.execute("INSERT OR IGNORE INTO category_rules(id,name,pattern,category,priority,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![r.0,r.1,r.2,r.3,r.4,r.5 as i32,r.6])?;
        }
        for d in &envelope.duplicates {
            tx.execute("INSERT OR IGNORE INTO duplicate_decisions(id,batch_id,candidate_id,incoming_json,certainty,reason,decision,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![d.0,d.1,d.2,d.3,d.4,d.5,d.6,d.7])?;
        }
        for a in &envelope.audit {
            tx.execute("INSERT OR IGNORE INTO audit_log(id,entity_id,action,before_json,after_json,occurred_at) VALUES (?1,?2,?3,?4,?5,?6)",params![a.0,a.1,a.2,a.3,a.4,a.5])?;
        }
        let after: i64 = tx.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
        tx.commit()?;
        Ok(RestoreResult {
            inserted: if replace {
                after as usize
            } else {
                after.saturating_sub(before) as usize
            },
            conflicts: if replace { 0 } else { conflicts },
            replaced: replace,
        })
    }

    pub fn move_to(&mut self, destination: &Path) -> Result<DatabaseInfo, DbError> {
        if destination == self.path {
            return self.info();
        }
        if destination.exists() {
            return Err(DbError("destination exists".into()));
        }
        self.backup_to(destination)?;
        let new_conn = Connection::open(destination)?;
        new_conn.busy_timeout(Duration::from_secs(5))?;
        new_conn.pragma_update(None, "journal_mode", "WAL")?;
        new_conn.pragma_update(None, "foreign_keys", "ON")?;
        new_conn.pragma_update(None, "synchronous", "FULL")?;
        self.conn = new_conn;
        self.path = destination.to_path_buf();
        fs::write(
            &self.location_file,
            serde_json::to_vec(&self.path.to_string_lossy().to_string())?,
        )?;
        self.info()
    }

    pub fn clear(&mut self) -> Result<(), DbError> {
        let tx = self.conn.transaction()?;
        tx.execute_batch("DELETE FROM duplicate_decisions; DELETE FROM audit_log; DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM import_batches;")?;
        tx.commit()?;
        Ok(())
    }

    pub fn export_json(&self, destination: &Path) -> Result<(), DbError> {
        #[derive(Serialize)]
        struct Envelope {
            schema_version: i64,
            exported_at: String,
            transactions: Vec<Transaction>,
            batches: Vec<ImportBatch>,
            categories: Vec<(String, String, String, bool)>,
            rules: Vec<(String, String, String, String, i64, bool, String)>,
            duplicates: Vec<(
                String,
                String,
                Option<String>,
                String,
                String,
                String,
                String,
                String,
            )>,
            audit: Vec<(
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                String,
            )>,
        }
        let transactions = self.transactions(usize::MAX, 0)?;
        let batches = self.all_batches()?;
        let categories = self
            .conn
            .prepare("SELECT id,name,color,builtin FROM categories")?
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i32>(3)? != 0))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let rules = self
            .conn
            .prepare(
                "SELECT id,name,pattern,category,priority,enabled,created_at FROM category_rules",
            )?
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get::<_, i32>(5)? != 0,
                    r.get(6)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let duplicates=self.conn.prepare("SELECT id,batch_id,candidate_id,incoming_json,certainty,reason,decision,created_at FROM duplicate_decisions")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?)))?.collect::<Result<Vec<_>,_>>()?;
        let audit = self
            .conn
            .prepare(
                "SELECT id,entity_id,action,before_json,after_json,occurred_at FROM audit_log",
            )?
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let envelope = Envelope {
            schema_version: SCHEMA_VERSION,
            exported_at: chrono::Utc::now().to_rfc3339(),
            transactions,
            batches,
            categories,
            rules,
            duplicates,
            audit,
        };
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(destination, serde_json::to_vec_pretty(&envelope)?)?;
        Ok(())
    }

    fn all_batches(&self) -> Result<Vec<ImportBatch>, DbError> {
        let mut stmt=self.conn.prepare("SELECT id,filename,source,imported_at,added_count,duplicate_count,excluded_count,undone FROM import_batches ORDER BY imported_at")?;
        let rows = stmt.query_map([], |r| {
            Ok(ImportBatch {
                id: r.get(0)?,
                filename: r.get(1)?,
                source: r.get(2)?,
                imported_at: r.get(3)?,
                added_count: r.get::<_, i64>(4)? as usize,
                duplicate_count: r.get::<_, i64>(5)? as usize,
                excluded_count: r.get::<_, i64>(6)? as usize,
                undone: r.get::<_, i32>(7)? != 0,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn export_csv(
        &self,
        destination: &Path,
        start: &str,
        end: &str,
        source: &str,
        category: &str,
        kind: &str,
    ) -> Result<(), DbError> {
        let mut stmt=self.conn.prepare("SELECT occurred_at,source,kind,direction,merchant,description,amount_cents,category,status,included,exclusion_reason FROM transactions WHERE substr(occurred_at,1,10)>=?1 AND substr(occurred_at,1,10)<=?2 AND (?3='all' OR source=?3) AND (?4='all' OR category=?4) AND (?5='all' OR kind=?5) ORDER BY occurred_at DESC")?;
        let rows = stmt.query_map(params![start, end, source, category, kind], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, i32>(9)? != 0,
                r.get::<_, Option<String>>(10)?,
            ))
        })?;
        let mut csv =
            String::from("时间,来源,类型,方向,商户,描述,金额(元),分类,状态,计入统计,排除原因\n");
        for row in rows {
            let r = row?;
            let fields = vec![
                r.0,
                r.1,
                r.2,
                r.3,
                r.4,
                r.5,
                format!("{}.{:02}", r.6 / 100, r.6.abs() % 100),
                r.7,
                r.8,
                if r.9 { "是".into() } else { "否".into() },
                r.10.unwrap_or_default(),
            ];
            csv.push_str(
                &fields
                    .into_iter()
                    .map(csv_escape)
                    .collect::<Vec<_>>()
                    .join(","),
            );
            csv.push('\n');
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(destination, format!("\u{feff}{csv}"))?;
        Ok(())
    }
}

fn csv_escape(value: String) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn same_path(a: &Path, b: &Path) -> bool {
    a.canonicalize()
        .ok()
        .zip(b.canonicalize().ok())
        .map(|(left, right)| left == right)
        .unwrap_or_else(|| a == b)
}

fn map_transaction(r: &Row<'_>) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: r.get(0)?,
        source: r.get(1)?,
        platform_id: r.get(2)?,
        occurred_at: r.get(3)?,
        amount_cents: r.get(4)?,
        kind: r.get(5)?,
        direction: r.get(6)?,
        merchant: r.get(7)?,
        description: r.get(8)?,
        payment_method: r.get(9)?,
        raw_category: r.get(10)?,
        category: r.get(11)?,
        status: r.get(12)?,
        linked_transaction_id: r.get(13)?,
        included: r.get::<_, i32>(14)? != 0,
        exclusion_reason: r.get(15)?,
        rule_reason: r.get(16)?,
        batch_id: r.get(17)?,
        raw_json: r.get(18)?,
        fingerprint: r.get(19)?,
        manually_modified: r.get::<_, i32>(20)? != 0,
        created_at: r.get(21)?,
        updated_at: r.get(22)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn initializes_versioned_schema_and_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let db =
            Database::open(dir.path().join("test.db"), dir.path().join("location.json")).unwrap();
        assert_eq!(db.info().unwrap().schema_version, 1);
        let categories: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
            .unwrap();
        assert_eq!(categories, 10);
    }

    fn mock_tx(id: &str, platform_id: &str) -> Transaction {
        Transaction {
            id: id.into(),
            source: "wechat".into(),
            platform_id: Some(platform_id.into()),
            occurred_at: "2026-03-12T12:00:00".into(),
            amount_cents: 1890,
            kind: "expense".into(),
            direction: "支出".into(),
            merchant: "模拟食堂".into(),
            description: "模拟午餐".into(),
            payment_method: "零钱".into(),
            raw_category: "".into(),
            category: "餐饮".into(),
            status: "支付成功".into(),
            linked_transaction_id: None,
            included: true,
            exclusion_reason: None,
            rule_reason: "模拟数据".into(),
            batch_id: String::new(),
            raw_json: "{}".into(),
            fingerprint: "mock-fingerprint".into(),
            manually_modified: false,
            created_at: "2026-03-12T12:00:00Z".into(),
            updated_at: "2026-03-12T12:00:00Z".into(),
        }
    }

    #[test]
    fn multi_file_import_is_atomic_and_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let mut db =
            Database::open(dir.path().join("test.db"), dir.path().join("location.json")).unwrap();
        let first = ImportFile {
            filename: "mock-a.xlsx".into(),
            source: "wechat".into(),
            transactions: vec![mock_tx("same-id", "trade-a")],
            duplicate_decisions: Vec::new(),
        };
        let conflicting = ImportFile {
            filename: "mock-b.xlsx".into(),
            source: "wechat".into(),
            transactions: vec![mock_tx("same-id", "trade-b")],
            duplicate_decisions: Vec::new(),
        };
        assert!(db.import_files(vec![first, conflicting]).is_err());
        assert_eq!(db.info().unwrap().transaction_count, 0);
        let imported = db
            .import_files(vec![ImportFile {
                filename: "mock-a.xlsx".into(),
                source: "wechat".into(),
                transactions: vec![mock_tx("tx-1", "trade-a")],
                duplicate_decisions: Vec::new(),
            }])
            .unwrap();
        assert_eq!(imported[0].added, 1);
        let duplicate = db
            .import_files(vec![ImportFile {
                filename: "mock-a.xlsx".into(),
                source: "wechat".into(),
                transactions: vec![mock_tx("tx-2", "trade-a")],
                duplicate_decisions: Vec::new(),
            }])
            .unwrap();
        assert_eq!(duplicate[0].duplicates, 1);
        assert_eq!(db.info().unwrap().transaction_count, 1);
    }

    #[test]
    fn online_backup_restores_consistent_database() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("live.db");
        let backup_path = dir.path().join("backup.db");
        let mut db = Database::open(db_path, dir.path().join("location.json")).unwrap();
        db.import_files(vec![ImportFile {
            filename: "mock.xlsx".into(),
            source: "wechat".into(),
            transactions: vec![mock_tx("tx-1", "trade-a")],
            duplicate_decisions: Vec::new(),
        }])
        .unwrap();
        db.backup_to(&backup_path).unwrap();
        let mut restored = Database::open(
            dir.path().join("restored.db"),
            dir.path().join("restored-location.json"),
        )
        .unwrap();
        let report = restored.restore_from(&backup_path, false).unwrap();
        assert_eq!(report.inserted, 1);
        assert_eq!(restored.info().unwrap().transaction_count, 1);
    }

    #[test]
    fn json_restore_preserves_user_rules_and_transactions() {
        let dir = tempfile::tempdir().unwrap();
        let mut original = Database::open(
            dir.path().join("original.db"),
            dir.path().join("original-location.json"),
        )
        .unwrap();
        original
            .save_category_rule(CategoryRuleInput {
                name: "模拟规则".into(),
                pattern: "模拟食堂".into(),
                category: "餐饮".into(),
                enabled: true,
            })
            .unwrap();
        original
            .import_files(vec![ImportFile {
                filename: "mock.xlsx".into(),
                source: "wechat".into(),
                transactions: vec![mock_tx("tx-json", "trade-json")],
                duplicate_decisions: Vec::new(),
            }])
            .unwrap();
        let json_path = dir.path().join("backup.json");
        original.export_json(&json_path).unwrap();
        let mut restored = Database::open(
            dir.path().join("restore.db"),
            dir.path().join("restore-location.json"),
        )
        .unwrap();
        let report = restored.restore_json(&json_path, false).unwrap();
        assert_eq!(report.inserted, 1);
        assert_eq!(restored.category_rules().unwrap().len(), 1);
        assert_eq!(restored.info().unwrap().transaction_count, 1);
    }

    #[test]
    fn refund_matching_works_across_import_batches() {
        let dir = tempfile::tempdir().unwrap();
        let mut db =
            Database::open(dir.path().join("test.db"), dir.path().join("location.json")).unwrap();
        let mut refund = mock_tx("refund-1", "refund-id");
        refund.kind = "refund".into();
        refund.occurred_at = "2026-03-14T12:00:00".into();
        refund.included = false;
        refund.exclusion_reason = Some("未匹配".into());
        db.import_files(vec![ImportFile {
            filename: "refund.csv".into(),
            source: "wechat".into(),
            transactions: vec![refund],
            duplicate_decisions: Vec::new(),
        }])
        .unwrap();
        db.import_files(vec![ImportFile {
            filename: "expense.xlsx".into(),
            source: "wechat".into(),
            transactions: vec![mock_tx("expense-1", "expense-id")],
            duplicate_decisions: Vec::new(),
        }])
        .unwrap();
        let txs = db.transactions(10, 0).unwrap();
        let refund = txs.iter().find(|tx| tx.kind == "refund").unwrap();
        assert_eq!(refund.linked_transaction_id.as_deref(), Some("expense-1"));
        assert!(refund.included);
    }

    #[test]
    fn custom_keyword_rules_apply_and_manual_edits_are_audited() {
        let dir = tempfile::tempdir().unwrap();
        let mut db =
            Database::open(dir.path().join("test.db"), dir.path().join("location.json")).unwrap();
        db.save_category_rule(CategoryRuleInput {
            name: "模拟交通关键词".into(),
            pattern: "模拟食堂".into(),
            category: "交通".into(),
            enabled: true,
        })
        .unwrap();
        db.import_files(vec![ImportFile {
            filename: "mock.xlsx".into(),
            source: "wechat".into(),
            transactions: vec![mock_tx("tx-rule", "rule-id")],
            duplicate_decisions: Vec::new(),
        }])
        .unwrap();
        let before = db.transactions(10, 0).unwrap().remove(0);
        assert_eq!(before.category, "交通");
        db.update_transaction(
            &before.id,
            TransactionUpdate {
                category: "餐饮".into(),
                kind: "expense".into(),
                included: true,
            },
        )
        .unwrap();
        let after = db.transactions(10, 0).unwrap().remove(0);
        assert_eq!(after.category, "餐饮");
        assert!(after.manually_modified);
        let audit: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM audit_log WHERE entity_id=?1",
                [before.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(audit, 1);
    }

    #[test]
    fn undo_and_json_backup_preserve_batch_state() {
        let dir = tempfile::tempdir().unwrap();
        let mut db =
            Database::open(dir.path().join("test.db"), dir.path().join("location.json")).unwrap();
        let retained = db
            .import_files(vec![ImportFile {
                filename: "first.xlsx".into(),
                source: "wechat".into(),
                transactions: vec![mock_tx("keep", "keep-id")],
                duplicate_decisions: Vec::new(),
            }])
            .unwrap()
            .remove(0);
        let undone = db
            .import_files(vec![ImportFile {
                filename: "second.xlsx".into(),
                source: "wechat".into(),
                transactions: vec![mock_tx("remove", "remove-id")],
                duplicate_decisions: Vec::new(),
            }])
            .unwrap()
            .remove(0);
        assert_eq!(db.undo_batch(&undone.batch.id).unwrap(), 1);
        assert_eq!(db.info().unwrap().transaction_count, 1);
        let json = dir.path().join("backup.json");
        db.export_json(&json).unwrap();
        let mut restored = Database::open(
            dir.path().join("restored.db"),
            dir.path().join("restored-location.json"),
        )
        .unwrap();
        restored.restore_json(&json, false).unwrap();
        let undone_flag: i64 = restored
            .conn
            .query_row(
                "SELECT undone FROM import_batches WHERE id=?1",
                [undone.batch.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(undone_flag, 1);
        assert_eq!(restored.info().unwrap().transaction_count, 1);
        assert_eq!(retained.added, 1);
    }
}
