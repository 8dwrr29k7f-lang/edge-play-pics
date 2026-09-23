import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { wireBoard, kboBoard, tennisBoard, limitsText } from "./data/desk.js";

const { colors } = config;

function base(color = colors.navy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "⚡ EDGE PLAY PICS · LOCK · HEDGE · LEAN · HOLD · 21+" });
}

function tierIcon(action) {
  const a = (action || "").toUpperCase();
  if (a.includes("EXCLUSIVE") || a === "MAX") return "👑";
  if (a === "LOCK" || a === "TAKE") return "🔒";
  if (a === "HEDGE") return "🛡️";
  if (a === "LEAN" || a === "SMALL") return "➖";
  if (a === "HOLD") return "⏸️";
  return "🚫";
}

function mediaFields(list) {
  if (!list || !list.length) return [];
  const lines = list.map(
    (m) => `**${m.source}** — ${m.pick}\n→ \`${m.tier}\``
  );
  return [
    {
      name: "📡 MEDIA LOCKS (log · size yourself)",
      value: lines.join("\n\n").slice(0, 1000),
      inline: false
    }
  ];
}

export function wireEmbed() {
  const e = base(colors.gold)
    .setTitle(wireBoard.title || "⚡ WIRE")
    .setDescription(wireBoard.description || "Live wire board");
  for (const t of wireBoard.takes || []) {
    e.addFields({ name: t.name, value: t.value, inline: false });
  }
  for (const f of mediaFields(wireBoard.mediaLocks)) e.addFields(f);
  if (!(wireBoard.takes || []).length) {
    e.addFields({
      name: "Board",
      value: "Empty wire — run `/daily` or sport desks (`/mlb` `/nfl` … `/best`).",
      inline: false
    });
  }
  return e;
}

export function kboEmbed() {
  const e = base(colors.take)
    .setTitle("🌅 KBO · WHAT TO TAKE")
    .setDescription(`**${kboBoard.dateLabel || "KBO"}**\n${kboBoard.description || "Use /kbo for live pipeline"}`);

  for (const r of kboBoard.rows || []) {
    e.addFields({
      name: `${tierIcon(r.action)} ${r.action} · ${r.game}`,
      value: `**${r.side}**\n${r.why}`,
      inline: false
    });
  }

  e.addFields(
    {
      name: "📊 Pitchers / stats",
      value: (kboBoard.pitchers || []).map((p) => `• ${p}`).join("\n") || "—",
      inline: false
    },
    {
      name: "📡 Media notes",
      value: (kboBoard.media || []).map((m) => `• ${m}`).join("\n") || "—",
      inline: false
    },
    ...mediaFields(kboBoard.mediaLocks)
  );
  e.setFooter({ text: (kboBoard.footer || "KBO desk") + " · 21+" });
  return e;
}

export function tennisEmbed() {
  const e = base(colors.lean)
    .setTitle(tennisBoard.title || "🎾 TENNIS")
    .setDescription(tennisBoard.description || "Use /tennis for live pipeline");
  for (const t of tennisBoard.takes || []) {
    e.addFields({ name: t.name, value: t.value, inline: false });
  }
  for (const f of mediaFields(tennisBoard.mediaLocks)) e.addFields(f);
  return e;
}

export function limitsEmbed() {
  return base(colors.sit)
    .setTitle("🛑 LIMITS · Size by action")
    .setDescription(limitsText || "Max 2 tickets · size by tier");
}

export function kalshiEmbed() {
  return base(colors.gold)
    .setTitle("📡 KALSHI · Action labels")
    .setDescription(
      [
        "🔒 **LOCK** — mid wrong + tight spread · ≤0.5u after fees",
        "🛡️ **HEDGE** — only vs open exposure",
        "➖ **LEAN** — ≤12–40¢ sleeve tiny",
        "⏸️ **HOLD** — like the side, wait for ¢",
        "🚫 **SIT** — ≥88¢ chalk or ≥8¢ spread toxic",
        "",
        "**NO VERIFIED PICK** from sports engine — Kalshi is guidance only.",
        "Media “locks” on Kalshi screenshots → start **HOLD**, promote only with net math."
      ].join("\n")
    );
}

export function scoresEmbed(lines, status) {
  const e = base(colors.navy)
    .setTitle("📺 LIVE SCORES · MLB")
    .setDescription(status || "Live feed");
  if (!lines?.length) {
    e.addFields({ name: "Feed", value: "No games or feed blocked.", inline: false });
    return e;
  }
  e.addFields({
    name: "Board",
    value: lines.slice(0, 15).join("\n").slice(0, 1000) || "—",
    inline: false
  });
  return e;
}

export function helpEmbed() {
  return base(colors.gold)
    .setTitle("👑 EDGE PLAY PICS · THE DESK")
    .setDescription(
      [
        "**Daily automation (America/Chicago)**",
        "· 08:00 — full scan + board",
        "· 12:00 / 16:00 — monitor + stale + auto-grade",
        "· 20:00 — evening review",
        "· every SCAN_MINUTES — light reverify",
        "",
        "**Core**",
        "`/daily` `/scan` — multi-sport ESPN board",
        "`/lotd` `/locks` `/best` `/live` — process cards",
        "`/status` `/registry` — health + category map",
        "",
        "**Live category desks (pipeline)**",
        "`/mlb` `/nfl` `/nba` `/nhl` `/ncaaf` `/soccer` `/tennis` `/kbo`",
        "Each runs: DATA → MODEL → ANALYSIS → PICK or **NO VERIFIED PICK**",
        "",
        "**Offline desks (explicit NO VERIFIED PICK)**",
        "`/npb` `/mma` `/boxing` `/esports` — no feed wired yet",
        "`/kalshi` — guidance labels only",
        "",
        "**Tracker**",
        "`/track` `/pending` `/logpick` `/grade` `/review` `/learn`",
        "",
        "Engine never invents picks. NO PLAY is valid.",
        "21+ · 1-800-GAMBLER"
      ].join("\n")
    );
}
