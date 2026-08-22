ALTER TABLE title_buzz ADD COLUMN score REAL NOT NULL DEFAULT 0;

UPDATE title_buzz
SET score = MAX(0.0, (views - previous_views) * 1.0 / (previous_views + 500))
  * (CASE
       WHEN views >= 500000 THEN 3.0
       WHEN views >= 100000 THEN 2.3
       WHEN views >= 50000 THEN 2.0
       WHEN views >= 10000 THEN 1.3
       WHEN views >= 5000 THEN 1.0
       WHEN views >= 1000 THEN 0.5
       ELSE 0.1
     END)
WHERE article <> '' AND views > previous_views;

CREATE INDEX IF NOT EXISTS title_buzz_score_idx ON title_buzz (score DESC);
