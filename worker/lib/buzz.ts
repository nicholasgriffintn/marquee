export const MIN_TRENDING_VIEWS = 500;

const GROWTH_BASELINE = 500;
const AUDIENCE_SCALE = 500;

export function buzzScore(views: number, previousViews: number) {
  const growth = (views - previousViews) / (previousViews + GROWTH_BASELINE);

  return Math.max(0, growth) * Math.log10(1 + views / AUDIENCE_SCALE);
}

export function buzzScoreSql(titleId: string) {
  return `COALESCE((
    SELECT b.score FROM title_buzz AS b
    WHERE b.title_id = ${titleId} AND b.article <> '' AND b.views >= ${MIN_TRENDING_VIEWS}
  ), 0)`;
}
