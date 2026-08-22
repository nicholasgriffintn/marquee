ALTER TABLE catalog_titles ADD COLUMN poster_key TEXT;

UPDATE catalog_titles
SET poster_key = replace(replace(id, 'movie:', 'posters/movie-'), 'tv:', 'posters/tv-')
WHERE id IN (SELECT title_id FROM title_enrichment WHERE source = 'poster');
