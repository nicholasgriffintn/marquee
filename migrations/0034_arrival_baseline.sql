UPDATE title_provider_state
SET announced_at = CURRENT_TIMESTAMP
WHERE announced_at IS NULL;

CREATE INDEX IF NOT EXISTS title_provider_state_last_seen_idx
  ON title_provider_state (announced_at, last_seen_at);
