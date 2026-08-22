ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('viewer', 'admin'));

UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
