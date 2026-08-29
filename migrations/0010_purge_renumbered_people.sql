DELETE FROM catalog_people AS p
WHERE NOT EXISTS (SELECT 1 FROM catalog_credits AS c WHERE c.person_id = p.person_id);

DELETE FROM person_awards;
DELETE FROM person_award_sync;

UPDATE catalog_people
SET titles = (
  SELECT count(DISTINCT title_id)
  FROM catalog_credits
  WHERE catalog_credits.person_id = catalog_people.person_id
);
