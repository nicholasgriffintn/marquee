const WINDOW_DAYS = 7;
const STEP_YEARS = 5;
const MINIMUM_YEARS = 10;
const NAMED_YEARS = 4;
const DAY_MS = 86_400_000;

const YEAR_LIST = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

function monthDay(date: Date) {
  return date.toISOString().slice(5, 10);
}

export function anniversaryQuery(now: Date) {
  const from = monthDay(now);
  const to = monthDay(new Date(now.getTime() + (WINDOW_DAYS - 1) * DAY_MS));
  const wraps = from > to;
  const inWindow = wraps
    ? "(substr(release_date, 6) >= $1 OR substr(release_date, 6) <= $2)"
    : "substr(release_date, 6) BETWEEN $1 AND $2";
  const age = wraps
    ? "($3 + CASE WHEN substr(release_date, 6) < $1 THEN 1 ELSE 0 END - year)"
    : "($3 - year)";

  return {
    where: `${inWindow} AND year IS NOT NULL
       AND ${age} >= ${MINIMUM_YEARS} AND ${age} % ${STEP_YEARS} = 0`,
    order: `${age} DESC`,
    binds: [from, to, now.getUTCFullYear()],
  };
}

export function anniversaryCaption(years: number[]) {
  // oxlint-disable-next-line unicorn/no-array-sort
  const ordered = [...years].sort((left, right) => left - right);
  const oldest = ordered[0];
  const newest = ordered.at(-1);

  if (oldest === undefined || newest === undefined) {
    return "Round anniversaries landing this week";
  }

  return ordered.length > NAMED_YEARS
    ? `Round anniversaries landing this week, from ${oldest} to ${newest}`
    : `Round anniversaries landing this week: ${YEAR_LIST.format(ordered.map(String))}`;
}
