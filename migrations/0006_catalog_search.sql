CREATE VIRTUAL TABLE catalog_search USING fts5(
  title,
  original_title,
  overview,
  tags,
  people,
  title_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
