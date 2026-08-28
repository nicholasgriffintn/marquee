import { clamp } from "./numbers.ts";

export const MIN_TRENDING_VIEWS = 500;

const GROWTH_BASELINE = 500;
const AUDIENCE_SCALE = 500;

export const BOARD_LANGUAGES = ["en", "ja", "de", "fr", "ru", "es", "it", "zh", "pl", "pt"];
export const REFERENCE_LANGUAGE = "en";
export const MIN_LANGUAGE_VIEWS = 50;

const MAX_LANGUAGE_WEIGHT = 20;

export type LanguageReading = {
  language: string;
  views: number;
  previousViews: number;
};

export type WorldMeasure = {
  shares: Map<string, number>;
  views: number;
  previousViews: number;
};

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

function languageWeight(volume: number, reference: number) {
  return clamp(reference / Math.max(1, volume), 1, MAX_LANGUAGE_WEIGHT);
}

export function measureWorld(
  readings: LanguageReading[],
  volumes: Map<string, number>,
): WorldMeasure {
  const reference = volumes.get(REFERENCE_LANGUAGE) ?? 0;
  const weighted = readings.flatMap((reading) => {
    const volume = volumes.get(reading.language) ?? 0;

    return volume > 0
      ? [
          {
            ...reading,
            intensity: reading.views / volume,
            weight: languageWeight(volume, reference),
          },
        ]
      : [];
  });
  const intensity = weighted.reduce((total, entry) => total + entry.intensity, 0);
  const scaled = (pick: (entry: LanguageReading) => number) =>
    Math.round(weighted.reduce((total, entry) => total + pick(entry) * entry.weight, 0));

  return {
    shares: new Map(
      weighted.map((entry) => [entry.language, intensity > 0 ? entry.intensity / intensity : 0]),
    ),
    views: scaled((entry) => entry.views),
    previousViews: scaled((entry) => entry.previousViews),
  };
}
