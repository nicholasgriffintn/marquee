ALTER TABLE api_tokens
  ADD COLUMN scopes TEXT NOT NULL
  DEFAULT 'catalogue:read shelf:read shelf:write people:follow account:full';
