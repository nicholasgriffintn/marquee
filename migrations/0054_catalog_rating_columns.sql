ALTER TABLE catalog_titles ADD COLUMN vote_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_titles ADD COLUMN weighted_rating REAL NOT NULL DEFAULT 0;
ALTER TABLE catalog_titles ADD COLUMN blended_rating REAL NOT NULL DEFAULT 0;
