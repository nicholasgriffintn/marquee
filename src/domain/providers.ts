export type ProviderCategory =
  | "Subscription"
  | "Broadcaster"
  | "Free"
  | "Cinema"
  | "Specialist"
  | "Sport"
  | "Rent or buy"
  | "Additional coverage";
export type ProviderIntegration = "feed" | "direct" | "marker";
export type ProviderStatus = "feed" | "link" | "marker";
export type ProviderOfferKind = "subscription" | "free" | "rent" | "buy" | "other";

const PROVIDER_OFFER_KINDS: ReadonlyMap<string, ProviderOfferKind> = new Map([
  ["Subscription", "subscription"],
  ["Free", "free"],
  ["Free with ads", "free"],
  ["Rent", "rent"],
  ["Buy", "buy"],
  ["Other", "other"],
]);

export function knownProviderOfferKind(label: unknown) {
  return typeof label === "string" ? PROVIDER_OFFER_KINDS.get(label) : undefined;
}

export function providerOfferKind(label: string): ProviderOfferKind {
  return knownProviderOfferKind(label) ?? "other";
}

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
  entry("netflix", "N", "Netflix", "Subscription", "feed"),
  entry("prime-video", "prime", "Prime Video", "Subscription", "feed", ["Amazon Prime Video"]),
  entry("disney-plus", "Disney+", "Disney+", "Subscription", "feed", ["Disney Plus"]),
  entry("apple-tv-plus", "tv+", "Apple TV+", "Subscription", "feed", ["AppleTV+", "Apple TV Plus"]),
  entry("now", "NOW", "NOW", "Subscription", "feed", ["Now TV", "Now TV Cinema"]),
  entry("hbo-max", "HBO", "HBO Max", "Subscription", "feed", ["Max"]),
  entry("paramount-plus", "P+", "Paramount+", "Subscription", "feed", ["Paramount Plus"]),
  entry("discovery-plus", "d+", "discovery+", "Subscription", "feed", ["Discovery+"]),
  entry("sky-go", "Sky", "Sky Go", "Subscription", "feed"),
  entry("mgm-plus", "MGM+", "MGM+", "Subscription", "feed", ["MGM Plus"]),
  entry("hayu", "hayu", "Hayu", "Subscription", "feed"),
  entry("crunchyroll", "CR", "Crunchyroll", "Subscription", "feed"),

  entry("bbc-iplayer", "BBC", "BBC iPlayer", "Broadcaster", "feed", ["BBC IPlayer"]),
  entry("itvx", "ITVX", "ITVX", "Broadcaster", "feed", ["ITV", "ITV Amazon Channel"]),
  entry("channel-4", "4", "Channel 4", "Broadcaster", "feed", ["All 4"]),
  entry("channel-5", "5", "5", "Broadcaster", "feed", ["My5"]),
  entry("u", "U", "U", "Broadcaster", "marker"),
  entry("stv-player", "STV", "STV Player", "Broadcaster", "marker"),
  entry("s4c-clic", "S4C", "S4C Clic", "Broadcaster", "marker"),
  entry("freely", "FREE", "Freely", "Broadcaster", "marker"),

  entry("tubi", "tubi", "Tubi", "Free", "feed"),
  entry("pluto-tv", "PLUTO", "Pluto TV", "Free", "feed"),
  entry("plex", "PLEX", "Plex", "Free", "feed"),
  entry("rakuten-tv-free", "R", "Rakuten TV Free", "Free", "feed", ["Rakuten TV"]),
  entry("samsung-tv-plus", "S+", "Samsung TV Plus", "Free", "marker"),
  entry("lg-channels", "LG", "LG Channels", "Free", "marker"),
  entry("youtube", "YT", "YouTube", "Free", "direct", [], "https://www.youtube.com/"),

  entry("mubi", "MUBI", "MUBI", "Cinema", "feed"),
  entry("bfi-player", "BFI", "BFI Player", "Cinema", "feed"),
  entry("curzon-home-cinema", "C", "Curzon Home Cinema", "Cinema", "feed", ["Curzon"]),
  entry("arrow", "ARROW", "ARROW", "Cinema", "feed", ["Arrow Video Channel", "ARROW Player"]),
  entry("shudder", "S", "Shudder", "Cinema", "feed"),
  entry("cultpix", "CULT", "Cultpix", "Cinema", "feed"),
  entry("klassiki", "K", "Klassiki", "Cinema", "marker"),
  entry("dafilms", "DA", "DAFilms", "Cinema", "marker"),
  entry("eventive", "E", "Eventive", "Cinema", "direct", [], "https://watch.eventive.org/"),
  entry("filmbox-plus", "FB+", "FilmBox+", "Cinema", "feed", ["Filmbox+"]),

  entry("acorn-tv", "ACORN", "Acorn TV", "Specialist", "feed"),
  entry("history-hit", "HH", "History Hit", "Specialist", "feed"),
  entry("sundance-now", "SN", "Sundance Now", "Specialist", "feed", ["SundanceNow Doc Club"]),
  entry("curiosity-stream", "CS", "Curiosity Stream", "Specialist", "feed", ["CuriosityStream"]),
  entry("nebula", "NEB", "Nebula", "Specialist", "direct", [], "https://nebula.tv/"),
  entry("dropout", "DO", "Dropout", "Specialist", "direct", [], "https://www.dropout.tv/"),
  entry("gaia", "GAIA", "Gaia", "Specialist", "direct", [], "https://www.gaia.com/"),
  entry("wow-presents-plus", "WOW", "WOW Presents Plus", "Specialist", "feed"),
  entry("national-theatre-at-home", "NT", "National Theatre at Home", "Specialist", "marker"),
  entry("marquee-tv", "MTV", "Marquee TV", "Specialist", "marker"),
  entry("royal-opera-house-stream", "ROH", "Royal Opera House Stream", "Specialist", "marker"),
  entry("broadwayhd", "BHD", "BroadwayHD", "Specialist", "marker"),
  entry("kocowa-plus", "K+", "KOCOWA+", "Specialist", "feed", ["Kocowa"]),
  entry("hoichoi", "HC", "Hoichoi", "Specialist", "feed"),
  entry("eros-now", "EN", "Eros Now", "Specialist", "feed"),
  entry("sun-nxt", "SUN", "Sun NXT", "Specialist", "feed"),
  entry("simply-south", "SS", "Simply South", "Specialist", "marker"),
  entry("dekkoo", "D", "Dekkoo", "Specialist", "feed"),
  entry("outtv", "OUT", "OUTtv", "Specialist", "feed", ["OUTtv Apple TV Channel"]),
  entry("amc-plus", "AMC+", "AMC+", "Specialist", "feed", ["AMC Plus"]),
  entry("hidive", "HD", "HIDIVE", "Specialist", "feed"),
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
  entry("zee5", "Z5", "ZEE5", "Specialist", "feed"),
  entry("sonyliv", "SL", "SonyLIV", "Specialist", "marker"),
  entry("hotstar", "HS", "Hotstar", "Specialist", "feed", ["Disney+ Hotstar"]),
  entry("aha", "aha", "aha", "Specialist", "marker"),
  entry("manoramamax", "MAX", "ManoramaMAX", "Specialist", "marker"),
  entry("revry", "REV", "Revry", "Specialist", "marker"),
  entry("shortstv", "SHORT", "ShortsTV", "Specialist", "feed", ["ShortsTV Amazon Channel"]),
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

  entry("amazon-video", "A£", "Amazon Video", "Rent or buy", "feed", ["Amazon Video", "Amazon"]),
  entry("apple-tv-store", "A£", "Apple TV Store", "Rent or buy", "feed", [
    "iTunes",
    "Apple iTunes",
  ]),
  entry("sky-store", "SKY£", "Sky Store", "Rent or buy", "feed"),
  entry("rakuten-tv", "R£", "Rakuten TV", "Rent or buy", "feed"),
  entry("youtube-movies", "YT£", "YouTube Movies", "Rent or buy", "feed", ["YouTube"]),
  entry("microsoft-store", "MS£", "Microsoft Store", "Rent or buy", "feed", ["Windows Store"]),
  entry("google-play", "GP£", "Google Play Movies", "Rent or buy", "feed", [
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
  if (integration === "feed") {
    return "JustWatch";
  }

  if (integration === "direct") {
    return "Direct link, no feed";
  }

  return "Listed only, no feed";
}

export function normaliseProviderName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

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
