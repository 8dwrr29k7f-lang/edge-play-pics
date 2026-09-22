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
    .setTitle(wireBoard.title)
    .setDescription(wireBoard.description);
  for (const t of wireBoard.takes) {
    e.addFields({ name: t.name, value: t.value, inline: false });
  }
  for (const f of mediaFields(wireBoard.mediaLocks)) e.addFields(f);
  return e;
}

export function kboEmbed() {
  const e = base(colors.take)
    .setTitle("🌅 KBO · WHAT TO TAKE")
    .setDescription(`**${kboBoard.dateLabel}**\n${kboBoard.description}`);

  for (const r of kboBoard.rows) {
    e.addFields({
      name: `${tierIcon(r.action)} ${r.action} · ${r.game}`,
      value: `**${r.side}**\n${r.why}`,
      inline: false
    });
  }

  e.addFields(
    {
      name: "📊 Pitchers / stats",
      value: kboBoard.pitchers.map((p) => `• ${p}`).join("\n"),
      inline: false
    },
    {
      name: "📡 Media notes",
      value: kboBoard.media.map((m) => `• ${m}`).join("\n"),
      inline: false
    },
    ...mediaFields(kboBoard.mediaLocks)
  );
  e.setFooter({ text: kboBoard.footer + " · 21+" });
  return e;
}

export function tennisEmbed() {
  const e = base(colors.lean)
    .setTitle(tennisBoard.title)
    .setDescription(tennisBoard.description);
  for (const t of tennisBoard.takes) {
    e.addFields({ name: t.name, value: t.value, inline: false });
  }
  for (const f of mediaFields(tennisBoard.mediaLocks)) e.addFields(f);
  return e;
}

export function limitsEmbed() {
  return base(colors.sit)
    .setTitle("🛑 LIMITS · Size by action")
    .setDescription(limitsText);
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
        "Media “locks” on Kalshi screenshots → start **HOLD**, promote only with net math."
      ].join("\n")
    );
}

export function scoresEmbed(lines, status) {
  const e = base(colors.navy)
    .setTitle("📺 LIVE SCORES · MLB")
    .setDescription(status || "Live feed");
  if (!lines.length) {
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
        "**Auto every day** — 7am CT new card · live scan every SCAN_MINUTES",
        "`/daily` — force roll today's picks from ESPN",
        "`/lotd` `/locks` `/lean` `/hold` `/live` `/hedge`",
        "`/media` `/follow` `/updates` `/cashout`",
        "`/track` `/logpick` `/grade` `/review` `/learn`",
        "`/scores` `/status`",
        "",
        "21+ · 1-800-GAMBLER"
      ].join("\n")
    );
}
