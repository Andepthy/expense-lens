CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, platform_id TEXT,
  occurred_at TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL, direction TEXT NOT NULL, merchant TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL DEFAULT '',
  raw_category TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '其他',
  status TEXT NOT NULL DEFAULT '', linked_transaction_id TEXT,
  included INTEGER NOT NULL DEFAULT 1, exclusion_reason TEXT, rule_reason TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL, raw_json TEXT NOT NULL DEFAULT '{}', fingerprint TEXT NOT NULL DEFAULT '',
  manually_modified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES import_batches(id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(linked_transaction_id) REFERENCES transactions(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL, filename TEXT NOT NULL, source TEXT NOT NULL,
  imported_at TEXT NOT NULL, added_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0, excluded_count INTEGER NOT NULL DEFAULT 0,
  undone INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#718096', builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE category_rules (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, pattern TEXT NOT NULL,
  category TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE duplicate_decisions (
  id TEXT PRIMARY KEY NOT NULL, batch_id TEXT NOT NULL, candidate_id TEXT,
  incoming_json TEXT NOT NULL, certainty TEXT NOT NULL, reason TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  before_json TEXT, after_json TEXT, occurred_at TEXT NOT NULL
);
CREATE UNIQUE INDEX transactions_source_platform_id ON transactions(source, platform_id) WHERE platform_id IS NOT NULL AND platform_id <> '';
CREATE INDEX transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX transactions_kind ON transactions(kind);
CREATE INDEX transactions_category ON transactions(category);
CREATE INDEX transactions_merchant ON transactions(merchant);
CREATE INDEX transactions_source ON transactions(source);
CREATE INDEX transactions_batch ON transactions(batch_id);
CREATE INDEX transactions_fingerprint ON transactions(fingerprint);
CREATE INDEX duplicate_decisions_batch ON duplicate_decisions(batch_id);
INSERT INTO categories(id,name,color,builtin) VALUES
  ('cat-food','餐饮','#d88b52',1),('cat-transport','交通','#6386c7',1),
  ('cat-shopping','购物','#ad78ba',1),('cat-housing','住房','#8a93a3',1),
  ('cat-bills','生活缴费','#4b9d8e',1),('cat-health','医疗','#d76e75',1),
  ('cat-entertainment','娱乐','#e0ae52',1),('cat-education','教育','#5a9dba',1),
  ('cat-travel','旅行','#4b9b9b',1),('cat-other','其他','#9a9fa9',1);
PRAGMA user_version = 1;
