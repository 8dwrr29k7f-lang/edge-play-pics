import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { summaryStats, analyzePatterns } from "./trackerCore.js";

export function learnEmbed() {
  const s = summaryStats();
  return new EmbedBuilder()
    .setColor(config.colors?.gold || 0xc4a35a)
    .setTitle("🧠 LEARN · MODEL PRIORS")
    .setDescription(
      [
        `**Ledger:** ${s.wins}W – ${s.losses}L – ${s.pushes}P`,
        `**Units:** ${s.units >= 0 ? "+" : ""}${s.units}u · ROI ${s.roi}%`,
        `**Pending:** ${s.pending}`,
        "",
        s.usedSeed
          ? "_Using day-1 seed until graded legs fill the ledger._"
          : "_Priors update as you `/grade` results. Patterns guide process — forced daily leans still use full analysis + smaller units._",
        "",
        "**Process rules**",
        "• LOCK when model + edge + DQ + autopsy pass; else force best leans daily",
        "• Thin samples and missing odds auto-downgrade",
        "• Stale board (>3h) triggers reanalysis alerts"
      ].join("\n")
    )
    .setFooter({ text: "EDGE PLAY · self-learning · 21+" })
    .setTimestamp();
}

export function enhanceReviewEmbed() {
  const { insights, graded, summary } = analyzePatterns();
  return new EmbedBuilder()
    .setColor(config.colors?.gold || 0xc4a35a)
    .setTitle("🧠 SELF-REVIEW · PATTERNS")
    .setDescription(
      `Graded legs: **${graded}** · Overall ${summary.wins}–${summary.losses} · ${summary.units >= 0 ? "+" : ""}${summary.units}u\n\n` +
        (insights || [])
          .slice(0, 14)
          .map((i) => {
            const icon = i.level === "good" ? "✅" : i.level === "warn" ? "⚠️" : "ℹ️";
            return `${icon} ${i.text}`;
          })
          .join("\n\n") ||
        "Log and grade more picks to unlock deeper pattern analysis."
    )
    .setFooter({ text: "Patterns guide process · forced leans labeled · learn from record · 21+" })
    .setTimestamp();
}
