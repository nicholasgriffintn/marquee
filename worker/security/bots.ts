export type BotStance = "open" | "crawlers" | "strict";

export type BotClass = "human" | "verified-bot" | "crawler" | "automated" | "suspect";

export type BotVerdict = { classification: BotClass; reason: string };

type BotManagement = {
  score?: number;
  verifiedBot?: boolean;
  corporateProxy?: boolean;
  staticResource?: boolean;
};

const SUSPECT_SCORE = 15;

const CRAWLER_AGENTS =
  /(googlebot|google-inspectiontool|storebot-google|bingbot|duckduckbot|applebot|yandex|baiduspider|slurp|twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|telegrambot|whatsapp|redditbot|pinterest|embedly|skypeuripreview|mastodon|bluesky)/u;

const DECLARED_CRAWLERS =
  /(oai-searchbot|chatgpt-user|claude-searchbot|claude-user|perplexitybot|perplexity-user|duckassistbot|youbot|ahrefsbot|ahrefssiteaudit|semrushbot|siteauditbot|screaming frog|sitebulb|dotbot|rogerbot|mj12bot)/u;

const AUTOMATION_AGENTS =
  /(bot\b|crawler|spider|scrape|curl|wget|python-requests|python-urllib|urllib|httpx|aiohttp|okhttp|axios|node-fetch|go-http-client|java\/|libwww|scrapy|puppeteer|playwright|headless|phantomjs|selenium|postman|insomnia|apachebench|siege|petalbot|bytespider|gptbot|ccbot|claudebot|amazonbot|dataforseo|zgrab|masscan)/u;

const ALLOWED: Record<BotStance, ReadonlySet<BotClass>> = {
  open: new Set<BotClass>(["human", "verified-bot", "crawler", "automated", "suspect"]),
  crawlers: new Set<BotClass>(["human", "verified-bot", "crawler"]),
  strict: new Set<BotClass>(["human"]),
};

function botManagement(request: Request) {
  return (request as Request & { cf?: { botManagement?: BotManagement } }).cf?.botManagement;
}

export function assessBot(request: Request): BotVerdict {
  const agent = (request.headers.get("user-agent") ?? "").toLowerCase().slice(0, 300);
  const management = botManagement(request);
  const verified = management ? management.verifiedBot === true : CRAWLER_AGENTS.test(agent);

  if (verified) {
    return { classification: "verified-bot", reason: "verified-crawler" };
  }

  if (DECLARED_CRAWLERS.test(agent)) {
    return { classification: "crawler", reason: "declared-crawler" };
  }

  if (!agent) {
    return { classification: "automated", reason: "missing-user-agent" };
  }

  if (AUTOMATION_AGENTS.test(agent)) {
    return { classification: "automated", reason: "automation-agent" };
  }

  if (typeof management?.score === "number" && management.score <= SUSPECT_SCORE) {
    return { classification: "suspect", reason: "low-bot-score" };
  }

  return { classification: "human", reason: "no-signal" };
}

export function allowsBot(stance: BotStance, verdict: BotVerdict) {
  return ALLOWED[stance].has(verdict.classification);
}
