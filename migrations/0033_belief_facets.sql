ALTER TABLE viewer_beliefs ADD COLUMN trait TEXT;

ALTER TABLE viewer_beliefs ADD COLUMN polarity TEXT
  CHECK (polarity IS NULL OR polarity IN ('seeks', 'avoids'));

UPDATE viewer_beliefs
   SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
 WHERE source_rule = 'ai:notes' AND revoked_at IS NULL;
