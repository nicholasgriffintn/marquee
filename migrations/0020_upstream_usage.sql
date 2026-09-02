CREATE TABLE source_usage (
  source TEXT NOT NULL,
  day DATE NOT NULL,
  calls BIGINT NOT NULL DEFAULT 0 CHECK (calls >= 0),
  failures BIGINT NOT NULL DEFAULT 0 CHECK (failures >= 0),
  duration_ms BIGINT NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  last_status INTEGER,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source, day)
);

CREATE INDEX source_usage_day_idx ON source_usage (day DESC, source);

CREATE INDEX catalog_title_providers_provider_idx ON catalog_title_providers (provider_id);
