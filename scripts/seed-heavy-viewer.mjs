import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

const LOGIN = process.env.SEED_LOGIN ?? "nicholasgriffintn";

const TARGETS = {
  watchedMovies: 1420,
  watchedShows: 340,
  watching: 48,
  watchlist: 560,
  dropped: 165,
  rejections: 720,
  recentRejections: 58,
  moodRejections: 26,
  never: 64,
  providerExits: 960,
  watchedSignals: 900,
  shelves: 9,
  railFeedback: 22,
  alerts: 96,
};

const GENRE_WEIGHTS = {
  "science fiction": 3,
  "sci-fi & fantasy": 3,
  animation: 2.6,
  thriller: 2,
  comedy: 1.9,
  crime: 1.8,
  drama: 1.7,
  fantasy: 1.6,
  adventure: 1.5,
  "action & adventure": 1.5,
  action: 1.4,
  mystery: 1.3,
  documentary: 1,
  history: 0.8,
  "war & politics": 0.6,
  war: 0.5,
  family: 0.4,
  music: 0.1,
  western: 0,
  romance: -0.7,
  horror: -1.3,
  "tv movie": -1,
  kids: -1.1,
  reality: -1.9,
  soap: -2.1,
  talk: -1.8,
  news: -1.7,
};

const FAVOURITE_PEOPLE = [
  "Mark Strong",
  "Robert De Niro",
  "Nicolas Cage",
  "Denis Villeneuve",
  "Christopher Nolan",
  "Bong Joon-ho",
  "Hayao Miyazaki",
  "Tilda Swinton",
  "Michael Mann",
  "Edgar Wright",
  "Park Chan-wook",
  "Toni Collette",
  "Rian Johnson",
  "Greta Gerwig",
  "Jake Gyllenhaal",
  "Ridley Scott",
];

const FOLLOWED_PEOPLE = [
  "Denis Villeneuve",
  "Mark Strong",
  "Bong Joon-ho",
  "Hayao Miyazaki",
  "Tilda Swinton",
  "Edgar Wright",
  "Park Chan-wook",
  "Nicolas Cage",
];

const PROVIDERS = [
  "netflix",
  "prime-video",
  "disney-plus",
  "hbo-max",
  "now",
  "apple-tv-plus",
  "bbc-iplayer",
  "itvx",
  "channel-4",
  "mubi",
  "bfi-player",
  "crunchyroll",
  "shudder",
  "arrow",
];

const EXIT_WEIGHTS = [
  ["netflix", 26],
  ["prime-video", 17],
  ["mubi", 12],
  ["hbo-max", 11],
  ["disney-plus", 9],
  ["bbc-iplayer", 8],
  ["now", 6],
  ["apple-tv-plus", 5],
  ["bfi-player", 3],
  ["itvx", 2],
  ["arrow", 1],
];

const RAIL_IDS = [
  "on-this-week",
  "fresh",
  "gems",
  "short",
  "binge",
  "archive",
  "family",
  "service-netflix",
  "service-prime-video",
  "service-disney-plus",
  "service-now",
  "service-hbo-max",
  "service-crunchyroll",
  "service-itvx",
  "genre-drama",
  "genre-comedy",
  "genre-animation",
  "mood-london-england",
  "mood-absurd",
  "local-broadcast",
  "local-cinema",
  "person-denis-villeneuve",
];

const SHORT_NOTES = [
  "Held up better than I expected.",
  "Second watch. Still the same ending, still got me.",
  "Sound mix was doing all the heavy lifting.",
  "Twenty minutes too long and it knows it.",
  "Watched this half asleep and still followed it.",
  "Everyone in this is doing a different accent.",
  "The middle hour is the whole film.",
  "Would not put this on again, but glad I saw it.",
  "Gorgeous and completely hollow.",
  "One of those where the trailer was the film.",
  "Best thing I've seen this year, and it's January.",
  "Fell asleep. Not the film's fault.",
  "Rewatched after the sequel. Better in isolation.",
  "The third act loses its nerve.",
  "Perfect Sunday afternoon film.",
  "A lot of shouting in rooms.",
  "Ending landed harder the second time.",
  "Should have been a series.",
  "Should have been ninety minutes.",
  "Great cast, wasted on this.",
  "That one shot alone is worth it.",
  "Funnier than it has any right to be.",
  "Genuinely unsettling in a way I wasn't ready for.",
  "Watched with the subtitles on for once. Helped.",
  "Absolute nonsense and I loved it.",
  "Pretty sure I've seen this before under another name.",
  "Not for me, but I can see why people rate it.",
  "Cinema would have been better. Living room did not do it justice.",
  "Everything before the reveal is excellent.",
  "The score does not stop and it should.",
];

const TEMPLATES = [
  (title) => `Put ${title} on expecting nothing and it quietly took the evening.`,
  (title, year) => `${year} was a strange year for this sort of thing. ${title} is proof.`,
  (title) =>
    `Second time with ${title}. The pacing problems are worse when you know where it goes.`,
  (title, year, person) =>
    `${person} is the only reason this works, and that was true in ${year} too.`,
  (title) => `Talked about ${title} for a week afterwards, which is more than most manage.`,
  (title, year, person) => `${person} carrying a film that does not deserve it. Again.`,
  (title) => `${title} is the kind of thing I'd defend loudly and never rewatch.`,
];

const LONG_NOTES = [
  `I have been circling this one for years and finally sat down with it properly, no phone, lights off, the whole ritual. The first hour is patient in a way that almost nothing gets to be any more — long takes, very little score, people talking around what they actually mean. Then it turns, and every bit of that patience pays. What struck me most was how little it explains itself. There is a scene about two thirds through where the camera simply stays on a face for what must be forty seconds and the entire premise of the film reorganises itself without a word of dialogue. I do not think I have stopped thinking about it since. My only complaint, and it is a real one, is the final ten minutes, which reach for a tidiness the rest of the film has earned the right to refuse. Still, one of the best things I have watched in a very long time, and I suspect it gets better on a rewatch when I am not spending the first act working out what kind of film I am in.`,
  `Difficult one to rate. Technically it is immaculate — the photography is genuinely beautiful, the production design is doing an enormous amount of quiet work, and the lead performance is the sort of thing that gets talked about for a decade. And yet. There is a coldness at the centre of it that I could never get past. Every character is an idea rather than a person, and once you notice the machinery you cannot unsee it. I kept waiting for one moment of genuine mess, one scene where somebody behaves in a way the script did not need them to, and it never arrives. Compare it to the films it is obviously in conversation with and it comes off as a very expensive homage rather than a thing with its own pulse. I am glad it exists, I am glad it got made at this scale, and I will probably never put it on again.`,
  `Watched this with the room half paying attention and it still worked, which says something. It is built for that — episodic, generous, funny in a way that does not require you to have been there for every setup. The plotting is nonsense if you look at it directly. Somebody crosses a country in what appears to be an afternoon and nobody involved seems to mind. But the cast are having such a visible good time that the whole thing floats along on goodwill. There is a running joke about a door that pays off three times and gets funnier each time, which is a rarer skill than people give credit for. Not important, not trying to be, and better for it. The sort of thing I will put on again when I want company rather than a film.`,
];

const STRESS_NOTES = [
  "Watched this with mum — she cried, I didn't. 😭🍿 Still thinking about the last shot ✨",
  "Un film magnifique. « Le silence est le vrai personnage. » Sous-titres impeccables.",
  "<script>alert('marquee')</script> — testing whether this renders as text, which it should.",
  "He said \"it's not about the money\" and then it was, entirely, about the money. O'Brien's whole arc in one line.",
  "First line.\nSecond line.\nThird line, with a tab\tin it.\n\nAnd a blank line above this one.",
  "映画としては完璧だった。音楽も素晴らしい。もう一度見たい。",
  "Загадочный фильм. Не могу перестать думать о концовке.",
  "Absolutelyunbelievablyoverwhelminglylongwordwithnospacesatalltoseewhathappenstothelayoutwhenitwraps",
  "Rated it 3 but honestly it's a 3.5 — the system won't let me say that, which is its own small tragedy.",
  "SPOILERS: the dog lives. That is the entire review. 🐕",
];

const SHELVES = [
  {
    name: "Sunday afternoon, curtains open",
    prompt: "Something warm that doesn't ask much of me",
    reason: "Pinned after a run of heavy evenings",
    size: 24,
    tone: "warm",
  },
  {
    name: "Cold, slow, subtitled",
    prompt: "European, glacial, preferably snowing",
    reason: "You keep coming back to these in January",
    size: 31,
    tone: "cold",
  },
  {
    name: "Films I keep meaning to rewatch and never do",
    prompt: "Things I rated four or five and have not touched since",
    reason: "Built from your own shelf",
    size: 48,
    tone: "loved",
  },
  {
    name: "For when the room is full",
    prompt: "Nothing that needs concentration, nothing anyone has to explain",
    reason: "Saved before Christmas",
    size: 18,
    tone: "crowd",
  },
  {
    name: "Villeneuve-adjacent",
    prompt: "Big, quiet, beautifully photographed science fiction",
    reason: "You follow Denis Villeneuve",
    size: 20,
    tone: "scifi",
  },
  {
    name: "Animation that isn't for children",
    prompt: "Animated, adult, not a franchise",
    reason: "Animation is your most-watched genre",
    size: 27,
    tone: "animation",
  },
  {
    name: "Under ninety minutes",
    prompt: "Short. In and out. Bed by ten.",
    reason: "Half of what you finish is under two hours",
    size: 34,
    tone: "short",
  },
  {
    name: "The very long list of things I will get to eventually, honestly, at some point, probably not",
    prompt: "Everything from the watchlist I have been avoiding for more than a year",
    reason: "Pinned as a joke, kept as a rebuke",
    size: 60,
    tone: "watchlist",
  },
  {
    name: "Crime, but funny",
    prompt: "Heists and criminals where nobody takes it too seriously",
    reason: "You rate these higher than anything else",
    size: 22,
    tone: "crime",
  },
];

const GUESTS = [
  { name: "Ellie", vetoes: ["Horror", "War"], leanings: ["Comedy", "Animation", "Romance"] },
  { name: "Dad", vetoes: ["Animation", "Fantasy"], leanings: ["Crime", "History", "Documentary"] },
  { name: "Sam", vetoes: ["Documentary"], leanings: ["Science Fiction", "Thriller", "Action"] },
  { name: "Mum", vetoes: ["Horror", "Thriller", "Crime"], leanings: ["Drama", "Comedy"] },
  {
    name: "The book club",
    vetoes: ["Action", "Science Fiction"],
    leanings: ["Drama", "History", "Romance"],
  },
  {
    name: "Jonno & Priya",
    vetoes: ["Musical", "Romance"],
    leanings: ["Crime", "Comedy", "Mystery"],
  },
  {
    name: "Niece (9)",
    vetoes: ["Horror", "Thriller", "War", "Crime"],
    leanings: ["Animation", "Family", "Adventure"],
  },
  {
    name: "Work lot",
    vetoes: ["Documentary", "Western"],
    leanings: ["Comedy", "Action", "Talked about"],
  },
];

const ANCHOR_TITLE_IDS = [
  "tv:1639",
  "tv:108978",
  "tv:113962",
  "tv:95350",
  "movie:969681",
  "movie:1375646",
  "movie:1084244",
  "movie:634649",
];

const REJECTION_REASONS = [
  "not tonight",
  "seen it",
  "too long",
  "wrong mood",
  "heard bad things",
  "not with company",
  "saving it",
];

function seedRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seedRandom(20260823);

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function chance(probability) {
  return random() < probability;
}

function between(low, high) {
  return low + Math.floor(random() * (high - low + 1));
}

function shuffle(list) {
  const copy = [...list];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));

    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

function weightedPick(pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const [value, weight] of pairs) {
    roll -= weight;

    if (roll <= 0) {
      return value;
    }
  }

  return pairs.at(-1)[0];
}

const NOW = Date.now();
const DAY = 86_400_000;

function stamp(daysAgo) {
  return new Date(NOW - daysAgo * DAY).toISOString().replace("T", " ").slice(0, 19);
}

function isoStamp(daysAgo) {
  return new Date(NOW - daysAgo * DAY).toISOString();
}

function skewedDaysAgo(maxDays) {
  return maxDays * random() ** 2.1 + random();
}

function databasePath() {
  const files = readdirSync(D1_DIR).filter((name) => name.endsWith(".sqlite"));
  const target = files.find((name) => name !== "metadata.sqlite");

  if (!target) {
    throw new Error(`No D1 sqlite file found in ${D1_DIR}`);
  }

  return join(D1_DIR, target);
}

function parseList(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

const database = new DatabaseSync(databasePath());

const viewer = database.prepare(`SELECT id, name FROM users WHERE github_login = ?`).get(LOGIN);

if (!viewer) {
  throw new Error(`No user with github_login ${LOGIN}`);
}

const viewerId = viewer.id;

const titles = database
  .prepare(
    `SELECT id,
            media_type AS mediaType,
            title,
            year,
            popularity,
            json_extract(payload, '$.genres') AS genres,
            json_extract(payload, '$.people') AS people,
            json_extract(payload, '$.runtimeMinutes') AS runtime
       FROM catalog_titles`,
  )
  .all()
  .map((row) => ({
    id: row.id,
    mediaType: row.mediaType,
    title: row.title,
    year: row.year,
    popularity: row.popularity ?? 0,
    genres: parseList(row.genres),
    people: parseList(row.people),
    runtime: row.runtime ?? null,
  }));

const favouriteSet = new Set(FAVOURITE_PEOPLE.map((name) => name.toLowerCase()));

function affinityFor(title) {
  const genreScore = title.genres.reduce(
    (total, genre) => total + (GENRE_WEIGHTS[genre.trim().toLowerCase()] ?? 0),
    0,
  );
  const peopleScore = title.people
    .slice(0, 8)
    .reduce((total, person) => total + (favouriteSet.has(person.toLowerCase()) ? 2.4 : 0), 0);
  const reach = Math.log10(1 + title.popularity) * 0.55;
  const vintage = title.year && title.year >= 1965 && title.year <= 2027 ? 0.4 : -0.6;

  return genreScore + peopleScore + reach + vintage + (random() - 0.5) * 2.4;
}

const scored = titles
  .map((title) => ({ ...title, affinity: affinityFor(title) }))
  .toSorted((left, right) => right.affinity - left.affinity);

const byId = new Map(scored.map((title) => [title.id, title]));
const movies = scored.filter((title) => title.mediaType === "movie");
const shows = scored.filter((title) => title.mediaType === "tv");

const taken = new Set();

function take(pool, count, { from = 0, spread = 1 } = {}) {
  const window = Math.max(count, Math.floor(pool.length * spread));
  const slice = pool.slice(from, from + window);
  const picked = [];

  for (const title of shuffle(slice)) {
    if (picked.length >= count) {
      break;
    }

    if (taken.has(title.id)) {
      continue;
    }

    taken.add(title.id);
    picked.push(title);
  }

  return picked;
}

const seasonRows = database
  .prepare(
    `SELECT title_id AS titleId, season_number AS seasonNumber, episode_count AS episodeCount
       FROM catalog_seasons ORDER BY title_id, season_number`,
  )
  .all();

const seasonsByShow = new Map();

for (const row of seasonRows) {
  const list = seasonsByShow.get(row.titleId) ?? [];

  list.push(row);
  seasonsByShow.set(row.titleId, list);
}

const existingEntries = ANCHOR_TITLE_IDS.filter((id) => byId.has(id));

const seasonShowIds = [...seasonsByShow.keys()].filter((id) => byId.has(id));
const anchored = [...new Set([...seasonShowIds, ...existingEntries])].map((id) => byId.get(id));

for (const title of anchored) {
  taken.add(title.id);
}

const anchoredShows = anchored.filter((title) => title.mediaType === "tv");
const anchoredMovies = anchored.filter((title) => title.mediaType === "movie");

const watchedMovies = [
  ...anchoredMovies,
  ...take(movies, Math.round(TARGETS.watchedMovies * 0.62), { spread: 0.16 }),
  ...take(movies, Math.round(TARGETS.watchedMovies * 0.26), { from: 900, spread: 0.4 }),
  ...take(movies, TARGETS.watchedMovies - Math.round(TARGETS.watchedMovies * 0.88), {
    from: 3400,
    spread: 1,
  }),
];

const completedShows = anchoredShows.slice(0, 8);
const progressShows = anchoredShows.slice(8);

const watchedShows = [
  ...completedShows,
  ...take(shows, Math.round(TARGETS.watchedShows * 0.7), { spread: 0.2 }),
  ...take(
    shows,
    TARGETS.watchedShows - Math.round(TARGETS.watchedShows * 0.7) - completedShows.length,
    {
      from: 700,
      spread: 0.6,
    },
  ),
];

const watchingTitles = [
  ...progressShows,
  ...take(shows, Math.round(TARGETS.watching * 0.7) - progressShows.length, { spread: 0.3 }),
  ...take(movies, TARGETS.watching - Math.round(TARGETS.watching * 0.7), { spread: 0.3 }),
];

const watchlistTitles = [
  ...take(movies, Math.round(TARGETS.watchlist * 0.6), { spread: 0.3 }),
  ...take(shows, Math.round(TARGETS.watchlist * 0.18), { spread: 0.3 }),
  ...take(movies, TARGETS.watchlist - Math.round(TARGETS.watchlist * 0.78), {
    from: 2200,
    spread: 1,
  }),
];

const disliked = scored
  .filter((title) => {
    const lowered = title.genres.map((genre) => genre.toLowerCase());

    return lowered.some((genre) => (GENRE_WEIGHTS[genre] ?? 0) <= -0.7);
  })
  .toSorted((left, right) => right.popularity - left.popularity);

const droppedTitles = [
  ...take(disliked, Math.round(TARGETS.dropped * 0.72), { spread: 0.5 }),
  ...take(scored, TARGETS.dropped - Math.round(TARGETS.dropped * 0.72), { from: 5200, spread: 1 }),
];

function ratingFor(title, status) {
  if (status === "watchlist") {
    return null;
  }

  if (status === "dropped") {
    return chance(0.2)
      ? null
      : weightedPick([
          [1, 5],
          [2, 6],
          [3, 2],
        ]);
  }

  if (status === "watching") {
    return chance(0.55)
      ? null
      : weightedPick([
          [3, 2],
          [4, 5],
          [5, 3],
        ]);
  }

  if (chance(0.12)) {
    return null;
  }

  if (title.affinity > 6) {
    return weightedPick([
      [5, 34],
      [4, 44],
      [3, 18],
      [2, 4],
    ]);
  }

  if (title.affinity > 3.5) {
    return weightedPick([
      [5, 18],
      [4, 40],
      [3, 30],
      [2, 9],
      [1, 3],
    ]);
  }

  if (title.affinity > 1) {
    return weightedPick([
      [5, 8],
      [4, 27],
      [3, 38],
      [2, 20],
      [1, 7],
    ]);
  }

  return weightedPick([
    [5, 3],
    [4, 14],
    [3, 33],
    [2, 32],
    [1, 18],
  ]);
}

function thoughtsFor(title, status) {
  if (status === "watchlist" && !chance(0.06)) {
    return "";
  }

  if (status !== "watchlist" && !chance(0.33)) {
    return "";
  }

  const roll = random();

  if (roll < 0.06) {
    return pick(LONG_NOTES);
  }

  if (roll < 0.13) {
    return pick(STRESS_NOTES);
  }

  if (roll < 0.45) {
    const template = pick(TEMPLATES);
    const person = title.people[0] ?? pick(FAVOURITE_PEOPLE);

    return template(title.title, title.year ?? "that year", person);
  }

  return pick(SHORT_NOTES);
}

const entries = [];

function addEntry(title, status, options = {}) {
  const daysAgo = options.daysAgo ?? skewedDaysAgo(status === "watchlist" ? 900 : 2200);
  const rating = options.rating === undefined ? ratingFor(title, status) : options.rating;

  entries.push({
    id: randomUUID(),
    titleId: title.id,
    status,
    rating,
    thoughts: thoughtsFor(title, status),
    season: options.season ?? null,
    episode: options.episode ?? null,
    createdAt: stamp(daysAgo + between(0, 40)),
    updatedAt: stamp(daysAgo),
    title,
  });
}

for (const title of watchedMovies) {
  addEntry(title, "watched");
}

for (const title of watchedShows) {
  addEntry(title, "watched");
}

for (const title of watchingTitles) {
  const seasons = seasonsByShow.get(title.id) ?? [];
  const season = seasons.length
    ? seasons.at(-1).seasonNumber
    : title.mediaType === "tv"
      ? between(1, 4)
      : null;
  const episode = title.mediaType === "tv" ? between(1, 8) : null;

  addEntry(title, "watching", { daysAgo: between(0, 90), season, episode });
}

for (const title of watchlistTitles) {
  addEntry(title, "watchlist");
}

for (const title of droppedTitles) {
  addEntry(title, "dropped", { daysAgo: skewedDaysAgo(1400) });
}

const watchedEntries = entries.filter((entry) => entry.status === "watched");
const lovedEntries = watchedEntries.filter((entry) => (entry.rating ?? 0) >= 4);

const episodeEntries = [];

function addEpisodeRows(showId, mode) {
  const seasons = seasonsByShow.get(showId) ?? [];

  if (!seasons.length) {
    return;
  }

  const cutoffSeason =
    mode === "complete"
      ? Infinity
      : seasons[Math.max(0, Math.floor(seasons.length * 0.6))].seasonNumber;
  const partialSeasonEpisodes = between(2, 7);

  for (const season of seasons) {
    const complete = mode === "complete" || season.seasonNumber < cutoffSeason;
    const current = mode !== "complete" && season.seasonNumber === cutoffSeason;

    if (!complete && !current) {
      continue;
    }

    const watchedCount = complete
      ? season.episodeCount
      : Math.min(season.episodeCount, partialSeasonEpisodes);

    episodeEntries.push({
      id: randomUUID(),
      titleId: showId,
      scope: "season",
      seasonNumber: season.seasonNumber,
      episodeNumber: 0,
      watched: complete ? 1 : 0,
      watchedAt: complete ? isoStamp(skewedDaysAgo(1100)) : null,
      rating:
        complete && chance(0.35)
          ? weightedPick([
              [3, 2],
              [4, 5],
              [5, 3],
            ])
          : null,
      notes: complete && chance(0.12) ? pick(SHORT_NOTES) : "",
    });

    for (let number = 1; number <= season.episodeCount; number += 1) {
      const watched = number <= watchedCount;

      episodeEntries.push({
        id: randomUUID(),
        titleId: showId,
        scope: "episode",
        seasonNumber: season.seasonNumber,
        episodeNumber: number,
        watched: watched ? 1 : 0,
        watchedAt: watched ? isoStamp(skewedDaysAgo(1100)) : null,
        rating:
          watched && chance(0.16)
            ? weightedPick([
                [2, 1],
                [3, 3],
                [4, 5],
                [5, 3],
              ])
            : null,
        notes: watched && chance(0.05) ? pick([...SHORT_NOTES, ...STRESS_NOTES]) : "",
      });
    }
  }
}

for (const show of completedShows) {
  addEpisodeRows(show.id, "complete");
}

for (const show of progressShows) {
  addEpisodeRows(show.id, "partial");
}

const signals = [];

function addSignal(type, titleId, context, daysAgo, options = {}) {
  signals.push({
    id: randomUUID(),
    type,
    titleId,
    journeyId: options.journeyId ?? `journey-${between(1000, 9999)}`,
    context: JSON.stringify(context),
    weight: options.weight ?? 1,
    createdAt: stamp(daysAgo),
    expiresAt: options.expiresAt ?? null,
  });
}

for (const entry of shuffle(watchedEntries).slice(0, TARGETS.watchedSignals)) {
  addSignal(
    "watched",
    entry.titleId,
    { source: pick(["shelf", "rail", "search", "usher"]) },
    skewedDaysAgo(900),
  );
}

const rejectionPool = shuffle(scored.slice(0, 4000));

for (let index = 0; index < TARGETS.rejections; index += 1) {
  const title = rejectionPool[index % rejectionPool.length];
  const daysAgo =
    index < TARGETS.recentRejections ? 1 + random() * 28 : 31 + (700 - 31) * random() ** 1.5;

  addSignal(
    "rejection",
    title.id,
    { reason: pick(REJECTION_REASONS), railId: pick(RAIL_IDS), source: "rail" },
    daysAgo,
  );
}

const moodPool = shuffle(disliked.slice(0, 400)).slice(0, TARGETS.moodRejections);

for (const title of moodPool) {
  addSignal("rejection", title.id, { reason: "wrong mood", source: "usher" }, random() * 24);
}

for (const title of shuffle(disliked.slice(0, 900)).slice(0, TARGETS.never)) {
  addSignal("never", title.id, { reason: "never", source: "title" }, skewedDaysAgo(800), {
    weight: 1.4,
  });
}

const exitPool = shuffle(watchedEntries);

for (let index = 0; index < TARGETS.providerExits; index += 1) {
  const entry = exitPool[index % exitPool.length];

  addSignal(
    "provider_exit",
    entry.titleId,
    { providerId: weightedPick(EXIT_WEIGHTS), source: pick(["watch-now", "title", "shelf"]) },
    skewedDaysAgo(600),
  );
}

function shelfTitles(tone, size) {
  const pools = {
    warm: watchedEntries.filter((entry) => entry.title.genres.includes("Comedy")),
    cold: watchedEntries.filter((entry) => entry.title.genres.includes("Drama")),
    loved: lovedEntries,
    crowd: watchedEntries.filter((entry) => entry.title.genres.includes("Adventure")),
    scifi: watchedEntries.filter((entry) => entry.title.genres.includes("Science Fiction")),
    animation: watchedEntries.filter((entry) => entry.title.genres.includes("Animation")),
    short: watchedEntries.filter((entry) => (entry.title.runtime ?? 200) <= 95),
    watchlist: entries.filter((entry) => entry.status === "watchlist"),
    crime: watchedEntries.filter((entry) => entry.title.genres.includes("Crime")),
  };
  const pool = pools[tone]?.length ? pools[tone] : watchedEntries;

  return shuffle(pool)
    .slice(0, size)
    .map((entry) => entry.titleId);
}

const shelves = SHELVES.slice(0, TARGETS.shelves).map((shelf, index) => ({
  id: randomUUID(),
  name: shelf.name,
  prompt: shelf.prompt,
  reason: shelf.reason,
  titleIds: JSON.stringify(shelfTitles(shelf.tone, shelf.size)),
  createdAt: stamp(index * 23 + between(1, 12)),
}));

const alerts = [];
const alertPools = {
  arrival: shuffle(entries.filter((entry) => entry.status === "watchlist")),
  season: shuffle(entries.filter((entry) => entry.title.mediaType === "tv")),
  cinema: shuffle(
    entries.filter((entry) => entry.status === "watchlist" && entry.title.mediaType === "movie"),
  ),
  person: shuffle(lovedEntries),
};

const ALERT_DETAILS = {
  arrival: (title, provider) => `${title} landed on ${provider}. It was on your list for a while.`,
  season: (title) => `${title} is back for another run. You were part-way through.`,
  cinema: (title) => `${title} is on a real screen near you this week.`,
  person: (title, person) => `${person} has something new: ${title}.`,
};

for (let index = 0; index < TARGETS.alerts; index += 1) {
  const kind = weightedPick([
    ["arrival", 8],
    ["season", 5],
    ["cinema", 4],
    ["person", 3],
  ]);
  const pool = alertPools[kind];
  const entry = pool[index % pool.length];
  const provider = weightedPick(EXIT_WEIGHTS);
  const person = pick(FOLLOWED_PEOPLE);

  alerts.push({
    kind,
    key: `${kind}:${entry.titleId}:${index}`,
    titleId: entry.titleId,
    channel: chance(0.75) ? "email" : "feed",
    detail: ALERT_DETAILS[kind](entry.title.title, kind === "person" ? person : provider),
    sentAt: stamp(skewedDaysAgo(210)),
  });
}

const statedGenres = [
  "Animation",
  "Sci-Fi & Fantasy",
  "Comedy",
  "Thriller",
  "Science Fiction",
  "Crime",
];
const statedActors = [
  "Mark Strong",
  "Robert De Niro",
  "Nicolas Cage",
  "Tilda Swinton",
  "Toni Collette",
];
const statedDirectors = [
  "Denis Villeneuve",
  "Bong Joon-ho",
  "Edgar Wright",
  "Park Chan-wook",
  "Hayao Miyazaki",
];
const seenIds = shuffle(watchedEntries)
  .slice(0, 30)
  .map((entry) => entry.titleId);

const answers = [
  ["providers", JSON.stringify(PROVIDERS.slice(0, 10))],
  ["genres", JSON.stringify(statedGenres)],
  ["frequency", JSON.stringify("nightly")],
  ["motivation", JSON.stringify(["get-lost", "critics", "switch-off", "talked-about"])],
  ["seen", JSON.stringify(seenIds)],
  ["actors", JSON.stringify(statedActors)],
  ["directors", JSON.stringify(statedDirectors)],
  ["runtime", JSON.stringify("any")],
  ["subtitles", JSON.stringify("happy")],
  ["novelty", JSON.stringify("mixed")],
];

const HUNCHES = [
  {
    key: "hunch:late-night",
    value: "Everything you finish after eleven is either animated or under ninety minutes.",
    strength: 0.7,
    confidence: 0.45,
  },
  {
    key: "hunch:sequels",
    value: "You rate the second film in a series higher than the first, almost every time.",
    strength: 0.6,
    confidence: 0.38,
  },
  {
    key: "hunch:january",
    value: "January is when you reach for the cold, slow, subtitled ones.",
    strength: 0.55,
    confidence: 0.42,
  },
];

const feedToken = `feed_${randomUUID().replaceAll("-", "")}`;
const feedHash = createHash("sha256").update(feedToken).digest("base64url");

const sessionToken = process.env.SEED_SESSION_TOKEN ?? `sess_${randomUUID().replaceAll("-", "")}`;
const sessionHash = createHash("sha256").update(sessionToken).digest("base64url");

function run(sql, ...bindings) {
  database.prepare(sql).run(...bindings);
}

database.exec("BEGIN");

run(
  `DELETE FROM belief_evidence WHERE belief_id IN (SELECT id FROM viewer_beliefs WHERE viewer_id = ?)`,
  viewerId,
);

for (const table of [
  "viewing_entries",
  "viewing_episode_entries",
  "viewer_signals",
  "viewer_beliefs",
  "pinned_shelves",
  "rail_feedback",
  "viewer_guests",
  "viewer_alerts",
  "viewer_alert_settings",
  "viewer_answers",
  "viewer_usher",
  "viewer_preferences",
  "viewer_feeds",
]) {
  run(`DELETE FROM ${table} WHERE viewer_id = ?`, viewerId);
}

const insertEntry = database.prepare(
  `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts, created_at, updated_at, season, episode)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

for (const entry of entries) {
  insertEntry.run(
    entry.id,
    viewerId,
    entry.titleId,
    entry.status,
    entry.rating,
    entry.thoughts,
    entry.createdAt,
    entry.updatedAt,
    entry.season,
    entry.episode,
  );
}

const insertEpisode = database.prepare(
  `INSERT INTO viewing_episode_entries
     (id, viewer_id, title_id, scope, season_number, episode_number, watched, watched_at, rating, notes, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

for (const row of episodeEntries) {
  const updated = row.watchedAt ?? stamp(skewedDaysAgo(400));

  insertEpisode.run(
    row.id,
    viewerId,
    row.titleId,
    row.scope,
    row.seasonNumber,
    row.episodeNumber,
    row.watched,
    row.watchedAt,
    row.rating,
    row.notes,
    updated,
    updated,
  );
}

const insertSignal = database.prepare(
  `INSERT INTO viewer_signals (id, viewer_id, type, title_id, journey_id, context, weight, created_at, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

for (const signal of signals) {
  insertSignal.run(
    signal.id,
    viewerId,
    signal.type,
    signal.titleId,
    signal.journeyId,
    signal.context,
    signal.weight,
    signal.createdAt,
    signal.expiresAt,
  );
}

const insertShelf = database.prepare(
  `INSERT INTO pinned_shelves (id, viewer_id, name, prompt, reason, title_ids, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

for (const shelf of shelves) {
  insertShelf.run(
    shelf.id,
    viewerId,
    shelf.name,
    shelf.prompt,
    shelf.reason,
    shelf.titleIds,
    shelf.createdAt,
  );
}

const insertRail = database.prepare(
  `INSERT INTO rail_feedback (viewer_id, rail_id, verdict, created_at) VALUES (?, ?, ?, ?)`,
);

for (const railId of shuffle(RAIL_IDS).slice(0, TARGETS.railFeedback)) {
  insertRail.run(viewerId, railId, chance(0.68) ? "good" : "bad", stamp(skewedDaysAgo(300)));
}

const insertGuest = database.prepare(
  `INSERT INTO viewer_guests (id, viewer_id, name, vetoes, leanings, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
);

GUESTS.forEach((guest, index) => {
  insertGuest.run(
    randomUUID(),
    viewerId,
    guest.name,
    JSON.stringify(guest.vetoes),
    JSON.stringify(guest.leanings),
    stamp(400 - index * 31),
  );
});

const insertAlert = database.prepare(
  `INSERT OR IGNORE INTO viewer_alerts (viewer_id, kind, alert_key, title_id, channel, detail, sent_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

for (const alert of alerts) {
  insertAlert.run(
    viewerId,
    alert.kind,
    alert.key,
    alert.titleId,
    alert.channel,
    alert.detail,
    alert.sentAt,
  );
}

const insertAlertSetting = database.prepare(
  `INSERT INTO viewer_alert_settings (viewer_id, kind, enabled, channel, updated_at) VALUES (?, ?, ?, ?, ?)`,
);

for (const [kind, enabled] of [
  ["arrival", 1],
  ["season", 1],
  ["cinema", 1],
  ["person", 0],
]) {
  insertAlertSetting.run(viewerId, kind, enabled, "email", stamp(between(3, 120)));
}

const insertAnswer = database.prepare(
  `INSERT INTO viewer_answers (viewer_id, question_id, answer, answered_at) VALUES (?, ?, ?, ?)`,
);

answers.forEach(([questionId, answer], index) => {
  insertAnswer.run(viewerId, questionId, answer, stamp(560 - index * 17));
});

run(
  `INSERT INTO viewer_usher (viewer_id, status, asked, muted, ignored, snoozed_until, last_prompted_at, updated_at, last_seen_at)
   VALUES (?, 'done', ?, ?, 0, NULL, ?, ?, ?)`,
  viewerId,
  JSON.stringify(answers.map(([questionId]) => questionId)),
  JSON.stringify({ rail: stamp(-14) }),
  stamp(2),
  stamp(0),
  stamp(0),
);

run(
  `INSERT INTO viewer_preferences (viewer_id, selected_provider_ids, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  viewerId,
  JSON.stringify(PROVIDERS),
  stamp(560),
  stamp(4),
);

const insertBelief = database.prepare(
  `INSERT INTO viewer_beliefs
     (id, viewer_id, key, value, strength, confidence, scope, source_rule, edited, suspended_until, expires_at, revoked_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
);

for (const name of FOLLOWED_PEOPLE) {
  insertBelief.run(
    randomUUID(),
    viewerId,
    `rule:person:${name.toLowerCase()}`,
    `You follow ${name}.`,
    1,
    1,
    "always",
    "manual:follow",
    1,
    null,
    stamp(between(60, 600)),
    stamp(between(1, 50)),
  );
}

for (const hunch of HUNCHES) {
  insertBelief.run(
    randomUUID(),
    viewerId,
    hunch.key,
    hunch.value,
    hunch.strength,
    hunch.confidence,
    "always",
    "hunch:notes",
    0,
    null,
    stamp(between(30, 200)),
    stamp(between(1, 20)),
  );
}

insertBelief.run(
  randomUUID(),
  viewerId,
  "habit:suspended-demo",
  "You said no more war films for a bit.",
  0.8,
  0.7,
  "week",
  "manual:edit",
  1,
  isoStamp(-6),
  stamp(40),
  stamp(3),
);

const insertEvidence = database.prepare(
  `INSERT OR IGNORE INTO belief_evidence (belief_id, evidence_kind, evidence_id, noted_at) VALUES (?, ?, ?, ?)`,
);

const beliefIds = database
  .prepare(`SELECT id, key FROM viewer_beliefs WHERE viewer_id = ?`)
  .all(viewerId);

for (const belief of beliefIds) {
  const evidence = shuffle(lovedEntries).slice(0, between(3, 9));

  for (const entry of evidence) {
    insertEvidence.run(belief.id, "entry", entry.id, stamp(skewedDaysAgo(200)));
  }
}

run(
  `INSERT INTO viewer_feeds (token_hash, viewer_id, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
  feedHash,
  viewerId,
  stamp(220),
  stamp(1),
);

run(
  `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  sessionHash,
  viewerId,
  new Date(NOW).toISOString(),
  new Date(NOW + 30 * DAY).toISOString(),
);

database.exec("COMMIT");

const counts = {
  entries: entries.length,
  watched: watchedEntries.length,
  watching: entries.filter((entry) => entry.status === "watching").length,
  watchlist: entries.filter((entry) => entry.status === "watchlist").length,
  dropped: entries.filter((entry) => entry.status === "dropped").length,
  rated: entries.filter((entry) => entry.rating !== null).length,
  withThoughts: entries.filter((entry) => entry.thoughts).length,
  episodeRows: episodeEntries.length,
  episodesWatched: episodeEntries.filter((row) => row.watched === 1).length,
  signals: signals.length,
  shelves: shelves.length,
  alerts: alerts.length,
  guests: GUESTS.length,
  beliefs: beliefIds.length,
};

console.log(JSON.stringify({ viewerId, login: LOGIN, sessionToken, feedToken, counts }, null, 2));
