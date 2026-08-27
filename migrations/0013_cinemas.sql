CREATE TABLE cinemas (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  latitude REAL,
  longitude REAL,
  booking_url TEXT,
  seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, site_id)
);

CREATE INDEX cinemas_latitude_idx ON cinemas (latitude);

CREATE INDEX cinemas_located_idx ON cinemas (latitude, longitude);

CREATE INDEX cinemas_source_idx ON cinemas (source);

CREATE TABLE cinema_films (
  source TEXT NOT NULL,
  source_film_id TEXT NOT NULL,
  title_id TEXT,
  source_title TEXT NOT NULL,
  source_year INTEGER,
  runtime_minutes INTEGER,
  confidence REAL NOT NULL DEFAULT 0,
  poster_url TEXT,
  film_url TEXT,
  matched_at TEXT,
  PRIMARY KEY (source, source_film_id)
);

CREATE INDEX cinema_films_confidence_idx ON cinema_films (confidence);

CREATE INDEX cinema_films_title_idx ON cinema_films (title_id);

CREATE TABLE cinema_screenings (
  id TEXT PRIMARY KEY,
  cinema_id TEXT NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_film_id TEXT NOT NULL,
  title_id TEXT,
  starts_at TEXT,
  business_day TEXT NOT NULL,
  precision TEXT NOT NULL DEFAULT 'exact' CHECK (precision IN ('exact', 'day', 'listing')),
  attributes TEXT NOT NULL DEFAULT '[]',
  booking_url TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX cinema_screenings_cinema_idx
  ON cinema_screenings (cinema_id, business_day);

CREATE INDEX cinema_screenings_day_idx
  ON cinema_screenings (business_day);

CREATE INDEX cinema_screenings_film_idx
  ON cinema_screenings (source, source_film_id);

CREATE INDEX cinema_screenings_title_idx
  ON cinema_screenings (title_id, business_day);

CREATE TABLE cinema_interest (
  cell TEXT PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX cinema_interest_seen_idx ON cinema_interest (last_seen_at DESC);
