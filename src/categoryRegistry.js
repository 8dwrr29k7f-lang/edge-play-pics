/**
 * MASTER CATEGORY REGISTRY
 * Single source of truth for every supported sport / market / desk command.
 *
 * Chain: CATEGORY → DATA → MODEL → ANALYSIS → PICK → DISPLAY → UPDATE → HISTORY
 *
 * If liveFeed is null, the pipeline MUST return NO VERIFIED PICK with reason —
 * never invent picks from static placeholders.
 */

export const MARKETS = {
  ml: { id: "ml", label: "Moneyline", engine: "evaluateMatchup" },
  spread: { id: "spread", label: "Spread", engine: "evaluateMatchup", status: "limited" },
  total: { id: "total", label: "Total", engine: "evaluateMatchup", status: "limited" },
  prop: { id: "prop", label: "Player prop", engine: null, status: "unsupported" }
};

/**
 * @typedef {object} CategoryDef
 * @property {string} key
 * @property {string} label
 * @property {string} emoji
 * @property {string} command
 * @property {string|null} feedKey - key into FEEDS in categoryPipeline / dailyEngine
 * @property {string|null} espnUrl
 * @property {string[]} markets
 * @property {string} model - analytics engine entry
 * @property {string[]} factors - sport-specific emphasis
 * @property {boolean} liveEnabled
 * @property {string} outputFormat
 * @property {string} historyVia - tracker path
 */

export const CATEGORY_REGISTRY = {
  mlb: {
    key: "mlb",
    label: "MLB",
    emoji: "⚾",
    command: "/mlb",
    feedKey: "mlb",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["starting pitcher", "record", "home/away", "park", "bullpen note"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks + autoGradeFromFinals"
  },
  nfl: {
    key: "nfl",
    label: "NFL",
    emoji: "🏈",
    command: "/nfl",
    feedKey: "nfl",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "home/away", "rest", "QB form proxy"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks + autoGradeFromFinals"
  },
  nba: {
    key: "nba",
    label: "NBA",
    emoji: "🏀",
    command: "/nba",
    feedKey: "nba",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "rest / B2B", "home/away", "form"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks + autoGradeFromFinals"
  },
  nhl: {
    key: "nhl",
    label: "NHL",
    emoji: "🏒",
    command: "/nhl",
    feedKey: "nhl",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "goalie note", "rest", "home/away"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks + autoGradeFromFinals"
  },
  ncaaf: {
    key: "ncaaf",
    label: "NCAAF",
    emoji: "🏈",
    command: "/ncaaf",
    feedKey: "ncaaf",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "home/away", "sample size"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks + autoGradeFromFinals"
  },
  soccer: {
    key: "soccer",
    label: "Soccer (EPL)",
    emoji: "⚽",
    command: "/soccer",
    feedKey: "soccer",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "home/away", "form"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks"
  },
  tennis: {
    key: "tennis",
    label: "Tennis",
    emoji: "🎾",
    command: "/tennis",
    feedKey: "tennis",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["form", "surface proxy", "matchup"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks"
  },
  kbo: {
    key: "kbo",
    label: "KBO",
    emoji: "🌅",
    command: "/kbo",
    feedKey: "kbo",
    espnUrl: "https://site.api.espn.com/apis/site/v2/sports/baseball/kbo/scoreboard",
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "starting pitcher", "home/away"],
    liveEnabled: true,
    outputFormat: "categoryDeskEmbed",
    historyVia: "trackerCore.ingestLivePicks"
  },
  npb: {
    key: "npb",
    label: "NPB",
    emoji: "🇯🇵",
    command: "/npb",
    feedKey: null,
    espnUrl: null,
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["record", "pitcher"],
    liveEnabled: false,
    noFeedReason: "No verified public ESPN scoreboard wired for NPB",
    outputFormat: "categoryDeskEmbed",
    historyVia: "manual /logpick only"
  },
  mma: {
    key: "mma",
    label: "MMA / UFC",
    emoji: "🥊",
    command: "/mma",
    feedKey: null,
    espnUrl: null,
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["form", "matchup"],
    liveEnabled: false,
    noFeedReason: "No verified live fight card feed wired",
    outputFormat: "categoryDeskEmbed",
    historyVia: "manual /logpick only"
  },
  boxing: {
    key: "boxing",
    label: "Boxing",
    emoji: "🥊",
    command: "/boxing",
    feedKey: null,
    espnUrl: null,
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["form", "matchup"],
    liveEnabled: false,
    noFeedReason: "No verified live card feed wired",
    outputFormat: "categoryDeskEmbed",
    historyVia: "manual /logpick only"
  },
  esports: {
    key: "esports",
    label: "Esports",
    emoji: "🎮",
    command: "/esports",
    feedKey: null,
    espnUrl: null,
    markets: ["ml"],
    model: "evaluateMatchup",
    factors: ["form"],
    liveEnabled: false,
    noFeedReason: "No verified esports odds/results feed wired",
    outputFormat: "categoryDeskEmbed",
    historyVia: "manual /logpick only"
  },
  kalshi: {
    key: "kalshi",
    label: "Kalshi",
    emoji: "📡",
    command: "/kalshi",
    feedKey: null,
    espnUrl: null,
    markets: ["ml"],
    model: null,
    factors: ["price band", "fees"],
    liveEnabled: false,
    noFeedReason: "Kalshi is action-label guidance only — not a sports prediction market in this bot",
    outputFormat: "kalshiEmbed",
    historyVia: "n/a"
  }
};

export function listCategoryKeys() {
  return Object.keys(CATEGORY_REGISTRY);
}

export function getCategory(key) {
  if (!key) return null;
  return CATEGORY_REGISTRY[String(key).toLowerCase()] || null;
}

export function liveCategoryKeys() {
  return Object.values(CATEGORY_REGISTRY)
    .filter((c) => c.liveEnabled && c.feedKey)
    .map((c) => c.key);
}

export function sportCommandKeys() {
  return Object.values(CATEGORY_REGISTRY).map((c) => c.key);
}
