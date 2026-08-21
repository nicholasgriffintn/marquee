export type ProviderCategory =
  | "Subscription"
  | "Broadcaster"
  | "Free"
  | "Cinema"
  | "Specialist"
  | "Sport"
  | "Rent or buy"
  | "Additional coverage";
export type ProviderIntegration = "watchmode" | "tmdb" | "direct" | "marker";
export type ProviderStatus = "feed" | "link" | "marker";
export type ProviderOfferKind = "subscription" | "free" | "rent" | "buy" | "other";

export type ProviderRegistryEntry = {
  id: string;
  mark: string;
  name: string;
  category: Exclude<ProviderCategory, "Additional coverage">;
  integration: ProviderIntegration;
  aliases: string[];
  homepage: string | null;
};

const entry = (
  id: string,
  mark: string,
  name: string,
  category: ProviderRegistryEntry["category"],
  integration: ProviderIntegration,
  aliases: string[] = [],
  homepage: string | null = null,
): ProviderRegistryEntry => ({
  id,
  mark,
  name,
  category,
  integration,
  aliases: [name, ...aliases],
  homepage,
});

export const providerRegistry: ProviderRegistryEntry[] = [
  entry("netflix", "N", "Netflix", "Subscription", "watchmode"),
  entry("prime-video", "prime", "Prime Video", "Subscription", "watchmode", ["Amazon Prime Video"]),
  entry("disney-plus", "Disney+", "Disney+", "Subscription", "watchmode", ["Disney Plus"]),
  entry("apple-tv-plus", "tv+", "Apple TV+", "Subscription", "watchmode", [
    "AppleTV+",
    "Apple TV Plus",
  ]),
  entry("now", "NOW", "NOW", "Subscription", "watchmode", ["Now TV", "Now TV Cinema"]),
  entry("hbo-max", "HBO", "HBO Max", "Subscription", "watchmode", ["Max"]),
  entry("paramount-plus", "P+", "Paramount+", "Subscription", "watchmode", ["Paramount Plus"]),
  entry("discovery-plus", "d+", "discovery+", "Subscription", "watchmode", ["Discovery+"]),
  entry("sky-go", "Sky", "Sky Go", "Subscription", "tmdb"),
  entry("mgm-plus", "MGM+", "MGM+", "Subscription", "tmdb", ["MGM Plus"]),
  entry("hayu", "hayu", "Hayu", "Subscription", "watchmode"),
  entry("crunchyroll", "CR", "Crunchyroll", "Subscription", "watchmode"),

  entry("bbc-iplayer", "BBC", "BBC iPlayer", "Broadcaster", "tmdb", ["BBC IPlayer"]),
  entry("itvx", "ITVX", "ITVX", "Broadcaster", "tmdb", ["ITV", "ITV Amazon Channel"]),
  entry("channel-4", "4", "Channel 4", "Broadcaster", "tmdb", ["All 4"]),
  entry("channel-5", "5", "5", "Broadcaster", "tmdb", ["My5"]),
  entry("u", "U", "U", "Broadcaster", "marker"),
  entry("stv-player", "STV", "STV Player", "Broadcaster", "marker"),
  entry("s4c-clic", "S4C", "S4C Clic", "Broadcaster", "marker"),
  entry("freely", "FREE", "Freely", "Broadcaster", "marker"),

  entry("tubi", "tubi", "Tubi", "Free", "watchmode"),
  entry("pluto-tv", "PLUTO", "Pluto TV", "Free", "watchmode"),
  entry("plex", "PLEX", "Plex", "Free", "watchmode"),
  entry("rakuten-tv-free", "R", "Rakuten TV Free", "Free", "watchmode", ["Rakuten TV"]),
  entry("samsung-tv-plus", "S+", "Samsung TV Plus", "Free", "marker"),
  entry("lg-channels", "LG", "LG Channels", "Free", "marker"),
  entry("youtube", "YT", "YouTube", "Free", "direct", [], "https://www.youtube.com/"),

  entry("mubi", "MUBI", "MUBI", "Cinema", "watchmode"),
  entry("bfi-player", "BFI", "BFI Player", "Cinema", "watchmode"),
  entry("curzon-home-cinema", "C", "Curzon Home Cinema", "Cinema", "tmdb", ["Curzon"]),
  entry("arrow", "ARROW", "ARROW", "Cinema", "watchmode", ["Arrow Video Channel", "ARROW Player"]),
  entry("shudder", "S", "Shudder", "Cinema", "watchmode"),
  entry("cultpix", "CULT", "Cultpix", "Cinema", "tmdb"),
  entry("klassiki", "K", "Klassiki", "Cinema", "marker"),
  entry("dafilms", "DA", "DAFilms", "Cinema", "marker"),
  entry("eventive", "E", "Eventive", "Cinema", "direct", [], "https://watch.eventive.org/"),
  entry("filmbox-plus", "FB+", "FilmBox+", "Cinema", "tmdb", ["Filmbox+"]),

  entry("acorn-tv", "ACORN", "Acorn TV", "Specialist", "watchmode"),
  entry("history-hit", "HH", "History Hit", "Specialist", "watchmode"),
  entry("sundance-now", "SN", "Sundance Now", "Specialist", "watchmode", ["SundanceNow Doc Club"]),
  entry("curiosity-stream", "CS", "Curiosity Stream", "Specialist", "watchmode", [
    "CuriosityStream",
  ]),
  entry("nebula", "NEB", "Nebula", "Specialist", "direct", [], "https://nebula.tv/"),
  entry("dropout", "DO", "Dropout", "Specialist", "direct", [], "https://www.dropout.tv/"),
  entry("gaia", "GAIA", "Gaia", "Specialist", "direct", [], "https://www.gaia.com/"),
  entry("wow-presents-plus", "WOW", "WOW Presents Plus", "Specialist", "tmdb"),
  entry("national-theatre-at-home", "NT", "National Theatre at Home", "Specialist", "marker"),
  entry("marquee-tv", "MTV", "Marquee TV", "Specialist", "marker"),
  entry("royal-opera-house-stream", "ROH", "Royal Opera House Stream", "Specialist", "marker"),
  entry("broadwayhd", "BHD", "BroadwayHD", "Specialist", "marker"),
  entry("kocowa-plus", "K+", "KOCOWA+", "Specialist", "tmdb", ["Kocowa"]),
  entry("hoichoi", "HC", "Hoichoi", "Specialist", "tmdb"),
  entry("eros-now", "EN", "Eros Now", "Specialist", "tmdb"),
  entry("sun-nxt", "SUN", "Sun NXT", "Specialist", "tmdb"),
  entry("simply-south", "SS", "Simply South", "Specialist", "marker"),
  entry("dekkoo", "D", "Dekkoo", "Specialist", "tmdb"),
  entry("outtv", "OUT", "OUTtv", "Specialist", "tmdb", ["OUTtv Apple TV Channel"]),
  entry("amc-plus", "AMC+", "AMC+", "Specialist", "tmdb", ["AMC Plus"]),
  entry("hidive", "HD", "HIDIVE", "Specialist", "tmdb"),
  entry(
    "rakuten-viki",
    "VIKI",
    "Rakuten Viki",
    "Specialist",
    "direct",
    ["Viki"],
    "https://www.viki.com/",
  ),
  entry("iqiyi", "iQIYI", "iQIYI", "Specialist", "direct", [], "https://www.iq.com/"),
  entry("wetv", "WeTV", "WeTV", "Specialist", "direct", [], "https://wetv.vip/"),
  entry("shahid", "SH", "Shahid", "Specialist", "marker"),
  entry("zee5", "Z5", "ZEE5", "Specialist", "tmdb"),
  entry("sonyliv", "SL", "SonyLIV", "Specialist", "marker"),
  entry("hotstar", "HS", "Hotstar", "Specialist", "tmdb", ["Disney+ Hotstar"]),
  entry("aha", "aha", "aha", "Specialist", "marker"),
  entry("manoramamax", "MAX", "ManoramaMAX", "Specialist", "marker"),
  entry("revry", "REV", "Revry", "Specialist", "marker"),
  entry("shortstv", "SHORT", "ShortsTV", "Specialist", "tmdb", ["ShortsTV Amazon Channel"]),
  entry("docplay", "DOC", "DocPlay", "Specialist", "marker"),
  entry("true-story", "TRUE", "True Story", "Specialist", "marker"),
  entry("magellantv", "MAG", "MagellanTV", "Specialist", "marker"),
  entry("guidedoc", "GD", "GuideDoc", "Specialist", "marker"),
  entry("love-nature", "LN", "Love Nature", "Specialist", "marker"),
  entry("qello-concerts", "Q", "Qello Concerts", "Specialist", "marker", [
    "Qello Concerts by Stingray",
  ]),
  entry("stageplayer-plus", "SP+", "StagePlayer+", "Specialist", "marker"),

  entry("dazn", "DAZN", "DAZN", "Sport", "direct", [], "https://www.dazn.com/en-GB/home"),
  entry("premier-sports", "PS", "Premier Sports", "Sport", "marker"),
  entry(
    "ufc-fight-pass",
    "UFC",
    "UFC Fight Pass",
    "Sport",
    "direct",
    [],
    "https://ufcfightpass.com/",
  ),
  entry("f1-tv", "F1", "F1 TV", "Sport", "direct", [], "https://f1tv.formula1.com/"),
  entry(
    "nfl-game-pass",
    "NFL",
    "NFL Game Pass on DAZN",
    "Sport",
    "direct",
    [],
    "https://www.dazn.com/en-GB/competition/Competition:wy3kluvb4efae1of0d8146c1",
  ),
  entry("rugbypass-tv", "RPTV", "RugbyPass TV", "Sport", "direct", [], "https://www.rugbypass.tv/"),
  entry("fifa-plus", "FIFA+", "FIFA+", "Sport", "direct", [], "https://www.plus.fifa.com/"),
  entry(
    "nba-league-pass",
    "NBA",
    "NBA League Pass",
    "Sport",
    "direct",
    [],
    "https://www.nba.com/watch/league-pass-stream",
  ),
  entry(
    "mlb-tv",
    "MLB",
    "MLB.TV",
    "Sport",
    "direct",
    [],
    "https://www.mlb.com/live-stream-games/subscribe",
  ),
  entry("tennis-tv", "TTV", "Tennis TV", "Sport", "direct", [], "https://www.tennistv.com/"),
  entry(
    "red-bull-tv",
    "RBTV",
    "Red Bull TV",
    "Sport",
    "direct",
    [],
    "https://www.redbull.com/gb-en/discover",
  ),

  entry("amazon-video", "A£", "Amazon Video", "Rent or buy", "watchmode", [
    "Amazon Video",
    "Amazon",
  ]),
  entry("apple-tv-store", "A£", "Apple TV Store", "Rent or buy", "watchmode", [
    "iTunes",
    "Apple iTunes",
  ]),
  entry("sky-store", "SKY£", "Sky Store", "Rent or buy", "watchmode"),
  entry("rakuten-tv", "R£", "Rakuten TV", "Rent or buy", "watchmode"),
  entry("youtube-movies", "YT£", "YouTube Movies", "Rent or buy", "watchmode", ["YouTube"]),
  entry("microsoft-store", "MS£", "Microsoft Store", "Rent or buy", "tmdb", ["Windows Store"]),
  entry("google-play", "GP£", "Google Play Movies", "Rent or buy", "watchmode", [
    "Google Play",
    "Google Play Movies & TV",
  ]),
];

export const providerRegistryIds = new Set(providerRegistry.map((provider) => provider.id));

export function providerMark(id: string, name: string) {
  const configured = providerRegistry.find((provider) => provider.id === id);

  return configured?.mark ?? name.slice(0, 2).toUpperCase();
}

export function providerStatus(integration: ProviderIntegration): ProviderStatus {
  if (integration === "direct") {
    return "link";
  }

  if (integration === "marker") {
    return "marker";
  }

  return "feed";
}

export function providerSourceLabel(integration: ProviderIntegration) {
  if (integration === "watchmode") {
    return "Watchmode";
  }

  if (integration === "tmdb") {
    return "TMDB / JustWatch";
  }

  if (integration === "direct") {
    return "Direct link";
  }

  return "Source marker";
}

export function normaliseProviderName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

// Aggregators list the same service many times over: reseller channels ("Shudder Amazon
// Channel"), storefront wrappers ("Acorn TV (Via Amazon Prime)"), and ad or tier variants
// ("Netflix Standard with Ads"). Trimming those markers gives one comparable key per service.
const REDUNDANT_MARKERS = [
  "withads",
  "amazonchannels",
  "amazonchannel",
  "appletvchannels",
  "appletvchannel",
  "primevideochannels",
  "primevideochannel",
  "rokuchannels",
  "rokuchannel",
  "channels",
  "channel",
  "premium",
  "standard",
  "essential",
  "basic",
  "kids",
  "free",
  "vip",
  "plus",
  "uk",
  "tv",
];

export function canonicalProviderName(value: string) {
  let comparable = normaliseProviderName(value.replace(/\([^()]*\)/gu, " "));
  let trimming = true;

  while (trimming) {
    trimming = false;

    for (const marker of REDUNDANT_MARKERS) {
      if (comparable.endsWith(marker) && comparable.length > marker.length + 1) {
        comparable = comparable.slice(0, -marker.length);
        trimming = true;
      }
    }
  }

  return comparable;
}

export function findRegistryProvider(name: string) {
  const comparable = normaliseProviderName(name);
  const canonical = canonicalProviderName(name);

  return (
    providerRegistry.find((provider) => normaliseProviderName(provider.name) === comparable) ??
    providerRegistry.find((provider) =>
      provider.aliases.some((alias) => normaliseProviderName(alias) === comparable),
    ) ??
    providerRegistry.find((provider) => canonicalProviderName(provider.name) === canonical) ??
    providerRegistry.find((provider) =>
      provider.aliases.some((alias) => canonicalProviderName(alias) === canonical),
    )
  );
}

export function findRegistryProviderForOffer(name: string, offerKind: ProviderOfferKind) {
  const canonical = canonicalProviderName(name);
  const transactional = offerKind === "rent" || offerKind === "buy";

  if (canonical === "rakuten") {
    return findRegistryProvider(offerKind === "free" ? "Rakuten TV Free" : "Rakuten TV");
  }

  if (canonical === "youtube") {
    return findRegistryProvider(transactional ? "YouTube Movies" : "YouTube");
  }

  if (canonical === "amazon" || canonical === "amazonprimevideo" || canonical === "primevideo") {
    return findRegistryProvider(transactional ? "Amazon Video" : "Prime Video");
  }

  if (canonical === "apple" || canonical === "itunes" || canonical === "appleitunes") {
    return findRegistryProvider(transactional ? "Apple TV Store" : "Apple TV+");
  }

  return findRegistryProvider(name);
}
