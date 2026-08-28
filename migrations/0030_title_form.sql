CREATE TABLE title_form (
  title_id TEXT PRIMARY KEY,
  colour TEXT,
  aspect_ratio TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX title_form_checked_idx ON title_form (checked_at);

CREATE INDEX title_form_colour_idx ON title_form (colour, title_id) WHERE colour IS NOT NULL;

CREATE INDEX title_form_aspect_idx
  ON title_form (aspect_ratio, title_id) WHERE aspect_ratio IS NOT NULL;
