/**
 * Tracker Discord surface — re-exports core + embeds
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import {
  load,
  save,
  logPick,
  gradePick,
  listPicks,
  summaryStats,
  analyzePatterns,
  ingestLivePicks,
  ensureSeedFile,
  plFromResult
} from "./trackerCore.js";

export {
  logPick,
  gradePick,
  listPicks,
  summaryStats,
  analyzePatterns,
  ingestLivePicks,
  ensureSeedFile,
  load,
  save
};

ensureSeedFile();

export function trackerSummaryEmbed() {
  const s = summaryStats();
  const color = s.units >= 0 ? 0x2ecc71 : 0xe74c3c;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("📊 PERFORMANCE TRACKER")
    .setDescription(
      (s.usedSeed
        ? "_Showing **day-1 seed** until leg-level grades fill the ledger._\n\n"
        : "") +
        `**Record:** ${s.wins}W – ${s.losses}L – ${s.pushes}P\n` +
        `**Units:** ${s.units >= 0 ? "+" : ""}${s.units}u · **ROI:** ${s.roi >= 0 ? "+" : ""}${s.roi}%\n` +
        `**Win%:** ${s.winPct}% (decided bets)\n` +
        `**Ledger:** ${s.graded} graded · ${s.pending} pending\n\n` +
        `Day-1 reference: **2–3 · −1.86u · −31.6% ROI** (do not overreact).\n` +
        `Log with \`/logpick\` · grade with \`/grade\` · learn with \`/review\`.`
    )
    .setFooter({ text: "EDGE PLAY · self-learning ledger · 21+" })
    .setTimestamp();
}

export function trackerReviewEmbed() {
  const { insights, graded, summary } = analyzePatterns();
  return new EmbedBuilder()
    .setColor(config.colors?.gold || 0xc4a35a)
    .setTitle("🧠 SELF-REVIEW · PATTERNS")
    .setDescription(
      `Graded legs: **${graded}** · Overall ${summary.wins}–${summary.losses} · ${summary.units >= 0 ? "+" : ""}${summary.units}u\n\n` +
        insights
          .slice(0, 14)
          .map((i) => {
            const icon =
              i.level === "good" ? "✅" : i.level === "warn" ? "⚠️" : "ℹ️";
            return `${icon} ${i.text}`;
          })
          .join("\n\n")
    )
    .setFooter({
      text: "Patterns guide process — they don’t force tickets · 21+"
    })
    .setTimestamp();
}

export function trackerPendingEmbed() {
  const rows = listPicks({ limit: 15, pendingOnly: true });
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("⏳ PENDING PICKS")
    .setDescription(
      rows.length
        ? rows
            .map(
              (p) =>
                `\`${p.id}\` **${p.sport}** ${p.selection} ${p.odds > 0 ? "+" : ""}${p.odds} · ${p.units}u · ${p.label}`
            )
            .join("\n")
        : "No pending picks. `/logpick` or live OpticOdds ingest to add."
    )
    .setFooter({ text: "Grade with /grade · 21+" })
    .setTimestamp();
}
