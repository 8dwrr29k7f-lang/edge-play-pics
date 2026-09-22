/**
 * Premium-only auto scanner
 * Posts EXCLUSIVE / MAX only — no lean spam.
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import {
  premiumAlerts,
  sportsDesk,
  mediaBySport,
  kboBoard,
  wireBoard
} from "./data/desk.js";
import { fetchMlbScores } from "./scores.js";

const { colors } = config;
const sent = new Map();
const DEDUPE_MS = 6 * 60 * 60 * 1000; // 6h for premium

function fresh(key, force) {
  if (force) {
    sent.delete(key);
  }
  const t = sent.get(key);
  if (t && Date.now() - t < DEDUPE_MS) return false;
  sent.set(key, Date.now());
  return true;
}

function premiumEmbed(alert) {
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle(`👑 EXCLUSIVE · ${alert.sport}`)
    .setDescription(
      `**${alert.title}**\n` +
        `${alert.market}\n\n` +
        `**Odds band:** ${alert.oddsBand}\n` +
        `**Size:** ${alert.size}\n\n` +
        `${alert.why}\n\n` +
        `📡 Media: ${alert.media || "—"}\n` +
        `⏱ ${alert.expires || "until line moves"}`
    )
    .setFooter({
      text: "💎 EDGE PLAY PICS · PREMIUM AUTO · not financial advice · 21+"
    })
    .setTimestamp();
}

export function detectPremiumLocks({ force = false } = {}) {
  const alerts = [];
  for (const a of premiumAlerts) {
    const key = `prem-${a.id}`;
    if (!fresh(key, force)) continue;
    alerts.push({
      content: `👑 **EXCLUSIVE / MAX** · ${a.sport} · auto-desk`,
      embeds: [premiumEmbed(a)]
    });
  }

  for (const r of kboBoard.rows || []) {
    if ((r.action || "").toUpperCase() !== "MAX") continue;
    const key = `kbo-max-${r.game}`;
    if (!fresh(key, force)) continue;
    if (!force) continue;
    alerts.push({
      content: "💎 **Premium filter armed · KBO** (no live EXCLUSIVE id yet)",
      embeds: [
        new EmbedBuilder()
          .setColor(colors.gold)
          .setTitle("💎 KBO · PREMIUM BAR")
          .setDescription(
            `**${r.game}**\n**${r.side}**\n${r.why}\n\n` +
              "Live EXCLUSIVE posts fire only when `premiumAlerts` has a confirmed id (SP + ¢)."
          )
          .setFooter({ text: "EDGE PLAY PICS · premium · 21+" })
          .setTimestamp()
      ]
    });
  }
  return alerts;
}

export async function runScan({ force = false } = {}) {
  const out = [];
  out.push(...detectPremiumLocks({ force }));

  if (force || fresh("media-by-sport", false)) {
    if (force || !sent.has("media-by-sport-posted")) {
      sent.set("media-by-sport-posted", Date.now());
      const e = new EmbedBuilder()
        .setColor(colors.navy)
        .setTitle(mediaBySport.title)
        .setDescription(
          mediaBySport.lines.join("\n") +
            "\n\n**Rule:** media overall ≠ EXCLUSIVE. Price + confirmations promote."
        )
        .setFooter({ text: "💎 PREMIUM · media radar · 21+" })
        .setTimestamp();
      out.push({ content: "📡 **Media overall by sport**", embeds: [e] });
    }
  }

  if (force) {
    const e = new EmbedBuilder()
      .setColor(colors.gold)
      .setTitle(sportsDesk.title)
      .setDescription(sportsDesk.description);
    for (const s of sportsDesk.sports.slice(0, 8)) {
      e.addFields({
        name: s.sport,
        value:
          `**Kalshi:** ${s.kalshi}\n` +
          `**Premium bar:** ${s.premiumBar}\n` +
          `**Media overall:** ${s.mediaOverall}\n` +
          `**Action:** ${s.action}`,
        inline: false
      });
    }
    out.push({ content: "💎 **All-sports premium map**", embeds: [e] });
  }

  if (force) {
    try {
      const { lines, status } = await fetchMlbScores();
      const e = new EmbedBuilder()
        .setColor(colors.navy)
        .setTitle("📺 Scores (grade only)")
        .setDescription(status || "—")
        .addFields({
          name: "Board",
          value: (lines.slice(0, 10).join("\n") || "—").slice(0, 1000),
          inline: false
        })
        .setFooter({ text: "Not a lock feed · 21+" })
        .setTimestamp();
      out.push({ content: "📺 **Score check**", embeds: [e] });
    } catch {
      /* ignore */
    }
  }

  return out;
}
