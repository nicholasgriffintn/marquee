ALTER TABLE title_working_set ADD COLUMN demand INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS title_working_set_demand_idx
  ON title_working_set (demand);
