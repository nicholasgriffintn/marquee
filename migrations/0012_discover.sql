CREATE TABLE discover_partitions (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  depth INTEGER NOT NULL DEFAULT 0,
  total_results INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  next_page INTEGER NOT NULL DEFAULT 1,
  pages_done INTEGER NOT NULL DEFAULT 0,
  measured_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX discover_partitions_refresh_idx
  ON discover_partitions (status, completed_at);

CREATE INDEX discover_partitions_status_idx
  ON discover_partitions (status, end_date DESC);
