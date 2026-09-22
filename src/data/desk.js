/**
 * EDGE PLAY PICS — desk data (complete export surface)
 */

export const limitsText = [
  "Max 2 tickets live",
  "AM risk ≤ 0.75u",
  "Day risk ≤ 5u",
  "SIT if cents ≥ 0.72",
  "LOCK max -150 American / 0.65 cents"
].join("\n");

export const premiumAlerts = [];

export const lockOfTheDay = {
  sport: "NFL",
  selection: "PHI ML",
  odds: -120,
  units: 1,
  why: "Named desk lock"
};

export const liveCard = {
  dateLabel: "Today",
  picks: [],
  leanBoard: [],
  holdBoard: [],
  mediaFollow: []
};

function cat(label, emoji, pick, odds, why) {
  return {
    label,
    emoji,
    kalshi: "—",
    mediaOverall: "—",
    best: {
      title: "BEST",
      pick,
      selection: pick,
      odds: String(odds),
      size: "0.5–1u",
      why
    },
    locks: [],
    leans: [],
    holds: [],
    pass: [],
    mediaBets: []
  };
}

export const categories = {
  mlb: cat("MLB", "⚾", "NYY ML", -110, "Named desk lean"),
  nfl: cat("NFL", "🏈", "PHI ML", -120, "Named desk lock"),
  nba: cat("NBA", "🏀", "BOS ML", -130, "Named desk lean"),
  nhl: cat("NHL", "🏒", "COL ML", -115, "Named desk lean"),
  ncaaf: cat("NCAAF", "🏈", "UGA ML", -200, "Named desk lean"),
  kbo: cat("KBO", "🌅", "LG ML", -105, "Named desk lean"),
  kalshi: cat("Kalshi", "📡", "—", 0, "All categories"),
  tennis: cat("Tennis", "🎾", "—", 0, "Pass")
};

export const wireBoard = {
  title: "⚡ WIRE",
  description: "Live wire board",
  takes: [],
  mediaLocks: []
};

export const kboBoard = {
  dateLabel: categories.kbo.label,
  description: categories.kbo.best.why,
  rows: [],
  pitchers: [],
  media: [],
  mediaLocks: [],
  footer: "KBO desk"
};

export const tennisBoard = {
  title: "🎾 TENNIS",
  description: "No strong edges",
  takes: [],
  mediaLocks: []
};

/** Used by scanner.js */
export const mediaBySport = {
  title: "📡 MEDIA OVERALL BY SPORT",
  lines: [
    "**MLB** — quiet",
    "**NFL** — quiet",
    "**NBA** — quiet",
    "**NHL** — quiet",
    "**NCAAF** — quiet",
    "**KBO** — quiet",
    "**Kalshi** — quiet"
  ]
};

/** Used by scanner.js */
export const sportsDesk = {
  title: "💎 ALL-SPORTS PREMIUM MAP",
  description: "Premium bar by sport — EXCLUSIVE only when confirmed.",
  sports: [
    { sport: "MLB", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "NFL", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "NBA", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "NHL", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "NCAAF", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "KBO", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" },
    { sport: "Kalshi", kalshi: "—", premiumBar: "PASS", mediaOverall: "—", action: "WAIT" }
  ]
};
