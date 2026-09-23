/**
 * Daily automation + change announcements
 */
import { EmbedBuilder } from "discord.js";
import { rollDailyCard, getLastBoard } from "./dailyRoll.js";
import { reverifyPicks, getCurrentBoard } from "./dailyEngine.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEDUPE_PATH = path.join(__dirname, "data", "announce_dedupe.json");

function loadDedupe() {
  try {
    if (fs.existsSync(DEDUPE_PATH)) return JSON.parse(fs.readFileSync(DEDUPE_PATH, "utf8"));
  } catch {}
  return {};
}

function saveDedupe(d) {
  try {
    fs.mkdirSync(path.dirname(DEDUPE_PATH), { recursive: true });
    fs.writeFileSync(DEDUPE_PATH, JSON.stringify(d, null, 2));
  } catch (e) {
    console.warn("dedupe save:", e.message);
  }
}

function chicagoDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === "year").value +
    parts.find((p) => p.type === "month").value +
    parts.find((p) => p.type === "day").value
  );
}

export async function morningBundle() {
  const key = chicagoDateKey();
  const dedupe = loadDedupe();
  if (dedupe.morningPosted === key) {
    console.log("morningBundle: already posted for", key, "— skip duplicate");
    const board = getCurrentBoard() || getLastBoard();
    const e = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle("🌅 DAILY SCAN · already published today")
      .setDescription(
        (board?.text || "Board already live for today. Use `/scan` to force refresh.").slice(0, 3500)
      )
      .setFooter({ text: "EDGE PLAY · dedupe · 21+" })
      .setTimestamp();
    return [{ embeds: [e] }];
  }

  const board = await rollDailyCard({ force: true });
  dedupe.morningPosted = key;
  saveDedupe(dedupe);

  const waiting = !!board.emptyBoard;
  const e = new EmbedBuilder()
    .setColor(waiting ? 0x95a5a6 : 0x2ecc71)
    .setTitle(waiting ? "🌅 DAILY SCAN · WAITING FOR GAMES" : "🌅 DAILY SCAN · BOARD LIVE")
    .setDescription((board.text || "Scan complete.").slice(0, 4000))
    .setFooter({ text: "EDGE PLAY · always publishes best available play · 21+" })
    .setTimestamp();
  return [{ embeds: [e] }];
}

export async function eveningBundle() {
  const board = getCurrentBoard() || getLastBoard();
  const e = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🌆 EVENING REVIEW")
    .setDescription(
      board
        ? (board.text || "").slice(0, 3500) +
          "\n\n_Post-game grading: use `/pending` then `/grade` when results are final._"
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
    } else if (u.type === "RESCAN" || u.type === "RESCAN_FAIL") {
      out.push({
        content: u.type === "RESCAN" ? "🔄 **BOARD REFRESHED**" : "⚠️ **RESCAN FAILED**",
        embeds: [
          new EmbedBuilder()
            .setColor(u.type === "RESCAN" ? 0x3498db : 0xe74c3c)
            .setTitle(u.type === "RESCAN" ? "🔄 AUTO RESCAN" : "⚠️ RESCAN FAILED")
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
  try {
    fs.mkdirSync(path.dirname(DEDUPE_PATH), { recursive: true });
  } catch {}
}
