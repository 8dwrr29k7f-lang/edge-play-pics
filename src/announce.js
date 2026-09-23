/**
 * Daily automation + change announcements
 * Morning scan, evening review, monitoring alerts
 */
import { EmbedBuilder } from "discord.js";
import { rollDailyCard, getLastBoard } from "./dailyRoll.js";
import { reverifyPicks, getCurrentBoard } from "./dailyEngine.js";
import { config } from "./config.js";

export async function morningBundle() {
  const board = await rollDailyCard({ force: true });
  const embeds = [];
  const e = new EmbedBuilder()
    .setColor(board.noPlay ? 0xe74c3c : 0x2ecc71)
    .setTitle(board.noPlay ? "🌅 DAILY SCAN · NO QUALIFYING PLAY" : "🌅 DAILY SCAN · BOARD LIVE")
    .setDescription((board.text || "Scan complete.").slice(0, 4000))
    .setFooter({ text: "EDGE PLAY · process guarantee only · 21+" })
    .setTimestamp();
  embeds.push(e);
  return embeds.map(em => ({ embeds: [em] }));
}

export async function eveningBundle() {
  const board = getCurrentBoard() || getLastBoard();
  const e = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🌆 EVENING REVIEW")
    .setDescription(
      board
        ? ((board.text || "").slice(0, 3500) + "\n\n_Post-game grading runs when results are final._")
        : "No board for today."
    )
    .setFooter({ text: "EDGE PLAY · transparent tracking · 21+" })
    .setTimestamp();
  return [{ embeds: [e] }];
}

export async function runChangeAnnounce() {
  const { updates, removed } = await reverifyPicks();
  const out = [];
  for (const u of updates) {
    if (u.type === "STALE") {
      out.push({
        content: "⚠️ **STALE — REANALYSIS REQUIRED**",
        embeds: [
          new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle("⚠️ STALE PICK")
            .setDescription(u.message)
            .setTimestamp()
        ]
      });
    }
  }
  for (const r of removed) {
    out.push({
      content: "🚨 **PICK REMOVED**",
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚨 PICK REMOVED")
          .setDescription(r.message || "Material change removed edge support.")
          .setTimestamp()
      ]
    });
  }
  return out;
}

export function initSnapshotIfEmpty() {
  // no-op; state created on first scan
}
