export type ProviderCategory =
  | "Subscription"
  | "Broadcaster"
  | "Free"
  | "Cinema"
  | "Specialist"
  | "Sport"
  | "Rent or buy"
  | "Additional coverage";

export type ProviderCapability = "directory" | "availability" | "watch" | "preference";

export type ProviderState = "live" | "stale" | "unresolved" | "out-of-scope" | "failed";

export type ProviderCatalogue = "film-tv" | "live-events";

export type ProviderOfferKind = "subscription" | "free" | "rent" | "buy" | "other";

export type ProviderRegistryEntry = {
  id: string;
  mark: string;
  name: string;
  category: Exclude<ProviderCategory, "Additional coverage">;
  aliases: string[];
  homepage: string | null;
  catalogue: ProviderCatalogue;
  note: string | null;
};

type EntryOptions = {
  aliases?: string[];
  catalogue?: ProviderCatalogue;
  note?: string;
};

const entry = (
  id: string,
  mark: string,
  name: string,
  category: ProviderRegistryEntry["category"],
  homepage: string | null,
  options: EntryOptions = {},
): ProviderRegistryEntry => ({
  id,
  mark,
  name,
  category,
  aliases: [name, ...(options.aliases ?? [])],
  homepage,
  catalogue: options.catalogue ?? "film-tv",
  note: options.note ?? null,
});

export const providerRegistry: ProviderRegistryEntry[] = [
  entry("netflix", "N", "Netflix", "Subscription", "https://www.netflix.com/gb/"),
  entry("prime-video", "prime", "Prime Video", "Subscription", "https://www.primevideo.com/", {
    aliases: ["Amazon Prime Video"],
  }),
  entry("disney-plus", "Disney+", "Disney+", "Subscription", "https://www.disneyplus.com/en-gb", {
    aliases: ["Disney Plus"],
  }),
  entry("apple-tv-plus", "tv+", "Apple TV+", "Subscription", "https://tv.apple.com/gb", {
    aliases: ["AppleTV+", "Apple TV Plus"],
  }),
  entry("now", "NOW", "NOW", "Subscription", "https://www.nowtv.com/", {
    aliases: ["Now TV", "Now TV Cinema"],
  }),
  entry("hbo-max", "HBO", "HBO Max", "Subscription", "https://www.hbomax.com/", {
    aliases: ["Max"],
  }),
  entry("paramount-plus", "P+", "Paramount+", "Subscription", "https://www.paramountplus.com/gb/", {
    aliases: ["Paramount Plus"],
  }),
  entry("discovery-plus", "d+", "discovery+", "Subscription", "https://www.discoveryplus.com/gb", {
    aliases: ["Discovery+"],
  }),
  entry("sky-go", "Sky", "Sky Go", "Subscription", "https://www.sky.com/watch/sky-go"),
  entry("mgm-plus", "MGM+", "MGM+", "Subscription", "https://www.mgmplus.com/", {
    aliases: ["MGM Plus"],
  }),
  entry("hayu", "hayu", "Hayu", "Subscription", "https://www.hayu.com/"),
  entry("crunchyroll", "CR", "Crunchyroll", "Subscription", "https://www.crunchyroll.com/"),

  entry("bbc-iplayer", "BBC", "BBC iPlayer", "Broadcaster", "https://www.bbc.co.uk/iplayer", {
    aliases: ["BBC IPlayer"],
  }),
  entry("itvx", "ITVX", "ITVX", "Broadcaster", "https://www.itv.com/", {
    aliases: ["ITV", "ITV Amazon Channel"],
  }),
  entry("channel-4", "4", "Channel 4", "Broadcaster", "https://www.channel4.com/", {
    aliases: ["All 4"],
  }),
  entry("channel-5", "5", "5", "Broadcaster", "https://www.channel5.com/", { aliases: ["My5"] }),
  entry("u", "U", "U", "Broadcaster", "https://u.co.uk/", {
    aliases: ["UKTV Play", "UKTV", "U Play"],
  }),
  entry("stv-player", "STV", "STV Player", "Broadcaster", "https://player.stv.tv/", {
    aliases: ["STV"],
  }),
  entry("s4c-clic", "S4C", "S4C Clic", "Broadcaster", "https://www.s4c.cymru/clic/", {
    aliases: ["S4C", "Clic"],
  }),
  entry("freely", "FREE", "Freely", "Broadcaster", "https://www.freely.co.uk/", {
    catalogue: "live-events",
    note: "A live-television aggregator over Freeview, so it carries no on-demand catalogue of its own.",
  }),

  entry("tubi", "tubi", "Tubi", "Free", "https://tubitv.com/"),
  entry("pluto-tv", "PLUTO", "Pluto TV", "Free", "https://pluto.tv/", { aliases: ["Pluto"] }),
  entry("plex", "PLEX", "Plex", "Free", "https://watch.plex.tv/"),
  entry("rakuten-tv-free", "R", "Rakuten TV Free", "Free", "https://rakuten.tv/", {
    aliases: ["Rakuten TV"],
  }),
  entry(
    "samsung-tv-plus",
    "S+",
    "Samsung TV Plus",
    "Free",
    "https://www.samsung.com/uk/tvs/tv-plus/",
    { aliases: ["Samsung TV Plus"] },
  ),
  entry("lg-channels", "LG", "LG Channels", "Free", "https://www.lg.com/uk/lg-channels", {
    aliases: ["LG Channels"],
  }),
  entry("youtube", "YT", "YouTube", "Free", "https://www.youtube.com/", {
    aliases: ["YouTube Free"],
  }),

  entry("mubi", "MUBI", "MUBI", "Cinema", "https://mubi.com/"),
  entry("bfi-player", "BFI", "BFI Player", "Cinema", "https://player.bfi.org.uk/", {
    aliases: ["BFI Player Amazon Channel", "BFI Player Rentals"],
  }),
  entry("curzon-home-cinema", "C", "Curzon Home Cinema", "Cinema", "https://www.curzon.com/", {
    aliases: ["Curzon"],
  }),
  entry("arrow", "ARROW", "ARROW", "Cinema", "https://www.arrow-player.com/", {
    aliases: ["Arrow Video Channel", "ARROW Player"],
  }),
  entry("shudder", "S", "Shudder", "Cinema", "https://www.shudder.com/"),
  entry("cultpix", "CULT", "Cultpix", "Cinema", "https://www.cultpix.com/"),
  entry("klassiki", "K", "Klassiki", "Cinema", "https://klassiki.online/"),
  entry("dafilms", "DA", "DAFilms", "Cinema", "https://dafilms.com/", {
    aliases: ["DAFilms.com", "Doc Alliance Films"],
  }),
  entry("eventive", "E", "Eventive", "Cinema", "https://watch.eventive.org/", {
    catalogue: "live-events",
    note: "A festival ticketing platform: each festival publishes its own window, so there is no standing catalogue to read.",
  }),
  entry("filmbox-plus", "FB+", "FilmBox+", "Cinema", "https://filmboxplus.com/", {
    aliases: ["Filmbox+"],
  }),

  entry("acorn-tv", "ACORN", "Acorn TV", "Specialist", "https://acorn.tv/", {
    aliases: ["AcornTV", "Acorn TV Amazon Channel"],
  }),
  entry("history-hit", "HH", "History Hit", "Specialist", "https://www.historyhit.com/", {
    aliases: ["History Hit Amazon Channel"],
  }),
  entry("sundance-now", "SN", "Sundance Now", "Specialist", "https://www.sundancenow.com/", {
    aliases: ["SundanceNow Doc Club", "SundanceNow"],
  }),
  entry(
    "curiosity-stream",
    "CS",
    "Curiosity Stream",
    "Specialist",
    "https://curiositystream.com/",
    {
      aliases: ["CuriosityStream"],
    },
  ),
  entry("nebula", "NEB", "Nebula", "Specialist", "https://nebula.tv/"),
  entry("dropout", "DO", "Dropout", "Specialist", "https://www.dropout.tv/", {
    aliases: ["Dropout TV", "DropoutTV"],
  }),
  entry("gaia", "GAIA", "Gaia", "Specialist", "https://www.gaia.com/", {
    aliases: ["Gaia Amazon Channel"],
  }),
  entry(
    "wow-presents-plus",
    "WOW",
    "WOW Presents Plus",
    "Specialist",
    "https://www.wowpresentsplus.com/",
  ),
  entry(
    "national-theatre-at-home",
    "NT",
    "National Theatre at Home",
    "Specialist",
    "https://www.ntathome.com/",
    { aliases: ["NT at Home", "National Theatre"] },
  ),
  entry("marquee-tv", "MTV", "Marquee TV", "Specialist", "https://www.marquee.tv/", {
    aliases: ["MarqueeTV", "Marquee TV Amazon Channel"],
  }),
  entry(
    "royal-opera-house-stream",
    "ROH",
    "Royal Opera House Stream",
    "Specialist",
    "https://www.rbo.org.uk/",
    { aliases: ["Royal Opera House", "ROH Stream", "Royal Ballet and Opera"] },
  ),
  entry("broadwayhd", "BHD", "BroadwayHD", "Specialist", "https://www.broadwayhd.com/", {
    aliases: ["Broadway HD"],
  }),
  entry("kocowa-plus", "K+", "KOCOWA+", "Specialist", "https://www.kocowa.com/", {
    aliases: ["Kocowa"],
  }),
  entry("hoichoi", "HC", "Hoichoi", "Specialist", "https://www.hoichoi.tv/"),
  entry("eros-now", "EN", "Eros Now", "Specialist", "https://erosnow.com/", {
    aliases: ["ErosNow"],
  }),
  entry("sun-nxt", "SUN", "Sun NXT", "Specialist", "https://www.sunnxt.com/", {
    aliases: ["SunNXT"],
  }),
  entry("simply-south", "SS", "Simply South", "Specialist", "https://www.simplysouth.tv/", {
    aliases: ["SimplySouth"],
  }),
  entry("dekkoo", "D", "Dekkoo", "Specialist", "https://www.dekkoo.com/", {
    aliases: ["Dekkoo Amazon Channel"],
  }),
  entry("outtv", "OUT", "OUTtv", "Specialist", "https://www.outtv.ca/", {
    aliases: ["OUTtv Apple TV Channel", "OUTtv Amazon Channel"],
  }),
  entry("amc-plus", "AMC+", "AMC+", "Specialist", "https://www.amcplus.com/", {
    aliases: ["AMC Plus"],
  }),
  entry("hidive", "HD", "HIDIVE", "Specialist", "https://www.hidive.com/"),
  entry("rakuten-viki", "VIKI", "Rakuten Viki", "Specialist", "https://www.viki.com/", {
    aliases: ["Viki"],
  }),
  entry("iqiyi", "iQIYI", "iQIYI", "Specialist", "https://www.iq.com/", { aliases: ["iQ.com"] }),
  entry("wetv", "WeTV", "WeTV", "Specialist", "https://wetv.vip/"),
  entry("shahid", "SH", "Shahid", "Specialist", "https://shahid.mbc.net/", {
    aliases: ["Shahid VIP", "Shahid MBC"],
  }),
  entry("zee5", "Z5", "ZEE5", "Specialist", "https://www.zee5.com/"),
  entry("sonyliv", "SL", "SonyLIV", "Specialist", "https://www.sonyliv.com/", {
    aliases: ["Sony LIV"],
  }),
  entry("hotstar", "HS", "Hotstar", "Specialist", "https://www.hotstar.com/", {
    aliases: ["Disney+ Hotstar"],
  }),
  entry("aha", "aha", "aha", "Specialist", "https://www.aha.video/", { aliases: ["Aha Video"] }),
  entry("manoramamax", "MAX", "ManoramaMAX", "Specialist", "https://www.manoramamax.com/", {
    aliases: ["Manorama Max"],
  }),
  entry("revry", "REV", "Revry", "Specialist", "https://revry.tv/"),
  entry("shortstv", "SHORT", "ShortsTV", "Specialist", "https://shortstv.com/", {
    aliases: ["ShortsTV Amazon Channel"],
  }),
  entry("docplay", "DOC", "DocPlay", "Specialist", "https://www.docplay.com/"),
  entry("true-story", "TRUE", "True Story", "Specialist", null, {
    aliases: ["TrueStory"],
    note: "No confirmed public home page for the UK offering; the entry stands on aggregator availability alone.",
  }),
  entry("magellantv", "MAG", "MagellanTV", "Specialist", "https://www.magellantv.com/", {
    aliases: ["Magellan TV", "MagellanTV Amazon Channel"],
  }),
  entry("guidedoc", "GD", "GuideDoc", "Specialist", "https://guidedoc.tv/", {
    aliases: ["Guidedoc"],
  }),
  entry("love-nature", "LN", "Love Nature", "Specialist", "https://www.lovenature.com/", {
    aliases: ["Love Nature Amazon Channel"],
  }),
  entry("qello-concerts", "Q", "Qello Concerts", "Specialist", "https://www.qello.com/", {
    aliases: ["Qello Concerts by Stingray", "Qello"],
  }),
  entry("stageplayer-plus", "SP+", "StagePlayer+", "Specialist", null, {
    aliases: ["StagePlayer", "Stage Player+"],
    note: "No confirmed public home page; the entry stands on aggregator availability alone.",
  }),

  entry("dazn", "DAZN", "DAZN", "Sport", "https://www.dazn.com/en-GB/home", {
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("premier-sports", "PS", "Premier Sports", "Sport", "https://www.premiersports.com/", {
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("ufc-fight-pass", "UFC", "UFC Fight Pass", "Sport", "https://ufcfightpass.com/", {
    aliases: ["UFC Fight Pass Amazon Channel"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("f1-tv", "F1", "F1 TV", "Sport", "https://f1tv.formula1.com/", {
    aliases: ["F1TV"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry(
    "nfl-game-pass",
    "NFL",
    "NFL Game Pass on DAZN",
    "Sport",
    "https://www.dazn.com/en-GB/competition/Competition:wy3kluvb4efae1of0d8146c1",
    {
      aliases: ["NFL Game Pass"],
      catalogue: "live-events",
      note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
    },
  ),
  entry("rugbypass-tv", "RPTV", "RugbyPass TV", "Sport", "https://www.rugbypass.tv/", {
    aliases: ["RugbyPass"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("fifa-plus", "FIFA+", "FIFA+", "Sport", "https://www.plus.fifa.com/", {
    aliases: ["FIFA Plus"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry(
    "nba-league-pass",
    "NBA",
    "NBA League Pass",
    "Sport",
    "https://www.nba.com/watch/league-pass-stream",
    {
      catalogue: "live-events",
      note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
    },
  ),
  entry("mlb-tv", "MLB", "MLB.TV", "Sport", "https://www.mlb.com/live-stream-games/subscribe", {
    aliases: ["MLB TV"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("tennis-tv", "TTV", "Tennis TV", "Sport", "https://www.tennistv.com/", {
    aliases: ["TennisTV"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),
  entry("red-bull-tv", "RBTV", "Red Bull TV", "Sport", "https://www.redbull.com/gb-en/discover", {
    aliases: ["Red Bull"],
    catalogue: "live-events",
    note: "A live-events platform. Fixtures are not film or television, so the availability aggregator does not index them; this stays a directory entry until live events become a domain of their own.",
  }),

  entry(
    "amazon-video",
    "A£",
    "Amazon Video",
    "Rent or buy",
    "https://www.amazon.co.uk/gp/video/storefront",
    { aliases: ["Amazon Video", "Amazon"] },
  ),
  entry("apple-tv-store", "A£", "Apple TV Store", "Rent or buy", "https://tv.apple.com/gb", {
    aliases: ["iTunes", "Apple iTunes"],
  }),
  entry("sky-store", "SKY£", "Sky Store", "Rent or buy", "https://www.skystore.com/"),
  entry("rakuten-tv", "R£", "Rakuten TV", "Rent or buy", "https://rakuten.tv/"),
  entry(
    "youtube-movies",
    "YT£",
    "YouTube Movies",
    "Rent or buy",
    "https://www.youtube.com/feed/storefront",
    { aliases: ["YouTube"] },
  ),
  entry(
    "microsoft-store",
    "MS£",
    "Microsoft Store",
    "Rent or buy",
    "https://www.microsoft.com/en-gb/store/movies-and-tv",
    { aliases: ["Windows Store"] },
  ),
  entry(
    "google-play",
    "GP£",
    "Google Play Movies",
    "Rent or buy",
    "https://play.google.com/store/movies",
    { aliases: ["Google Play", "Google Play Movies & TV"] },
  ),
];

export const providerRegistryIds = new Set(providerRegistry.map((provider) => provider.id));

export function providerMark(id: string, name: string) {
  const configured = providerRegistry.find((provider) => provider.id === id);

  return configured?.mark ?? name.slice(0, 2).toUpperCase();
}

export const PROVIDER_SOURCE_LABEL = "TMDB / JustWatch";

export const PROVIDER_LEDGER_VERSION = 2;

const STATE_COPY: Record<ProviderState, { label: string; note: string }> = {
  live: {
    label: "We can see inside",
    note: "Resolved upstream and answering. I know what is on there tonight.",
  },
  stale: {
    label: "Last known listing",
    note: "It answered before but not on the last sweep, so what you see is the last good reading.",
  },
  unresolved: {
    label: "Listed, nothing matched yet",
    note: "On the board because it exists, but nothing upstream has matched it, so I have no titles to attach.",
  },
  "out-of-scope": {
    label: "Not a catalogue I read",
    note: "Live events rather than a film and television catalogue. The door works; the listings are not mine to give.",
  },
  failed: {
    label: "Not answering",
    note: "The source it depends on failed on the last sweep and there is nothing older to fall back on.",
  },
};

export function providerStateCopy(state: ProviderState) {
  return STATE_COPY[state];
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

export const STREAMING_OFFER_TYPES = ["Subscription", "Free", "Free with ads"];

const STREAMING_OFFERS = new Set(STREAMING_OFFER_TYPES);

export function isStreamingOffer(offerType: string) {
  return STREAMING_OFFERS.has(offerType);
}

export function isStreamingAvailability(offerTypes: readonly string[]) {
  return offerTypes.length === 0 || offerTypes.some(isStreamingOffer);
}
