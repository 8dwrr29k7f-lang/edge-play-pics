/**
 * EDGE PLAY PICS — desk memory surface
 * Category picks are NO LONGER static placeholders.
 * Live data comes from categoryPipeline / dailyEngine only.
 */

export const limitsText = [
  "Max 2 tickets live",
  "AM risk ≤ 0.75u",
  "Day risk ≤ 5u",
  "SIT if cents ≥ 0.72",
  "LOCK max -150 American / 0.65 cents",
  "NO PLAY preferred over inventing confidence"
].join("\n");

export const premiumAlerts = [];

/** Filled by dailyRoll / category pipeline — never seed fake locks */
export const lockOfTheDay = {
  sport: "",
  selection: "",
  odds: "",
  units: 0,
  why: "NO VERIFIED PICK until live scan"
};

export const liveCard = {
  dateLabel: "Today",
  picks: [],
  leanBoard: [],
  holdBoard: [],
  mediaFollow: []
};

/** Legacy categories object kept empty for scanners that still import it */
export const categories = {};

export const wireBoard = {
  title: "⚡ WIRE",
  description: "Live wire — run /daily or sport desks (/mlb /nfl …)",
  takes: [],
  mediaLocks: []
};

export const kboBoard = {
  dateLabel: "KBO",
  description: "Use /kbo for live pipeline",
  rows: [],
  pitchers: [],
  media: [],
  mediaLocks: [],
  footer: "KBO desk · live pipeline"
};

export const tennisBoard = {
  title: "🎾 TENNIS",
  description: "Use /tennis for live pipeline",
  takes: [],
  mediaLocks: []
};

export const mediaBySport = {
  title: "📡 MEDIA OVERALL BY SPORT",
  lines: [
    "Media is signal-only.",
    "Verified picks come from category pipeline (/mlb /nfl /nba … /best)."
  ]
};

export const sportsDesk = {
  title: "💎 ALL-SPORTS MAP",
  description: "See /registry and /best for live category status.",
  sports: []
};
