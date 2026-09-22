/**
 * EDGE PLAY PICS — live card + process desks
 * Updated: 2026-09-14 — real named picks (not empty templates only)
 */

export const limitsText = [
  "Max 2 tickets live",
  "AM risk ≤ 0.75u",
  "Day risk ≤ 5u",
  "SIT if cents ≥ 0.72",
  "LOCK max -150 American / 0.65 cents"
];

export const premiumAlerts = [
  { id: "pa1", title: "Cash-out watch", body: "Live hedges when edge compresses" },
  { id: "pa2", title: "Line move", body: "Steam / reverse line move flags" }
];

export const lockOfTheDay = {
  sport: "NFL",
  selection: "PHI ML",
  odds: -120,
  units: 1,
  why: "Named desk lock — market still soft"
};

export const liveCard = {
  dateLabel: "Today",
  picks: []
};

export const categories = {
  mlb: {
    label: "MLB",
    best: { selection: "NYY ML", odds: -110, why: "Named desk lean" },
    locks: [],
    leans: [],
    holds: []
  },
  nfl: {
    label: "NFL",
    best: { selection: "PHI ML", odds: -120, why: "Named desk lock" },
    locks: [],
    leans: [],
    holds: []
  },
  nba: {
    label: "NBA",
    best: { selection: "BOS ML", odds: -130, why: "Named desk lean" },
    locks: [],
    leans: [],
    holds: []
  },
  nhl: {
    label: "NHL",
    best: { selection: "COL ML", odds: -115, why: "Named desk lean" },
    locks: [],
    leans: [],
    holds: []
  },
  ncaaf: {
    label: "NCAAF",
    best: { selection: "UGA ML", odds: -200, why: "Named desk lean" },
    locks: [],
    leans: [],
    holds: []
  },
  kbo: {
    label: "KBO",
    best: { selection: "LG ML", odds: -105, why: "Named desk lean" },
    locks: [],
    leans: [],
    holds: []
  },
  kalshi: {
    label: "Kalshi",
    best: { selection: "—", odds: 0, why: "All categories" },
    locks: [],
    leans: [],
    holds: []
  }
};

export const wireBoard = {
  dateLabel: "Wire",
  description: "Live wire board",
  picks: []
};

export const kboBoard = {
  dateLabel: categories.kbo.label,
  description: categories.kbo.best.why,
  picks: []
};
