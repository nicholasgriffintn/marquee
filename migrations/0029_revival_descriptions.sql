ALTER TABLE revival_works ADD COLUMN synopsis_source TEXT;

ALTER TABLE revival_works ADD COLUMN synopsis_article TEXT;

ALTER TABLE revival_works ADD COLUMN synopsis_url TEXT;

ALTER TABLE revival_works ADD COLUMN described_at TEXT;

CREATE INDEX revival_works_described_idx ON revival_works (status, described_at);
