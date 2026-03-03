-- TiDB / MySQL schema for Budget Monitoring
-- Run this once on your TiDB database.

CREATE TABLE IF NOT EXISTS budget_records (
  id VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  namaUser VARCHAR(255) NOT NULL,
  tim VARCHAR(255) NOT NULL,
  periode VARCHAR(64) NOT NULL,
  nilaiTagihan BIGINT NOT NULL,
  noRO VARCHAR(128) NULL,
  tglBAST VARCHAR(64) NULL,
  noBAST VARCHAR(128) NULL,
  status2 VARCHAR(255) NULL,
  emailSoftCopy VARCHAR(255) NULL,
  saNo VARCHAR(128) NULL,
  tglKirimJKT VARCHAR(64) NULL,
  reviewerVendor VARCHAR(255) NULL,
  keterangan TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Upload batch history (does NOT affect budget_records; safe to delete history without touching main data)
CREATE TABLE IF NOT EXISTS budget_upload_batches (
  id VARCHAR(64) NOT NULL,
  source VARCHAR(32) NULL,
  received INT NOT NULL,
  client_received INT NULL,
  client_sent_unique INT NULL,
  client_skipped_duplicates INT NULL,
  affected_rows INT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created_at (created_at)
);

-- Mapping of which record IDs were included in a given upload batch
CREATE TABLE IF NOT EXISTS budget_upload_batch_items (
  upload_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id, record_id),
  KEY idx_record_id (record_id),
  KEY idx_upload_created (upload_id, created_at)
);
