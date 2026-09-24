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

  const { boardToEmbedPayloads } = await import("./dailyEngine.js");
  const payloads = boardToEmbedPayloads(board);
  if (!payloads.length) {
    const waiting = !!board.emptyBoard || !!board.noPlay;
    const e = new EmbedBuilder()
      .setColor(waiting ? 0x95a5a6 : 0x2ecc71)
      .setTitle("🌅 DAILY SCAN · FULL CARD")
      .setDescription((board.text || "Scan complete.").slice(0, 4000))
      .setFooter({ text: "EDGE PLAY · full daily card · 21+" })
      .setTimestamp();
    return [{ embeds: [e] }];
  }
  // Prefix first embed title with morning marker
  const embeds = payloads.slice(0, 8).map((pl, i) => {
    const e = new EmbedBuilder()
      .setColor(pl.color)
      .setTitle(i === 0 ? `🌅 ${pl.title}` : pl.title)
      .setDescription(pl.description)
      .setFooter({ text: pl.footer || "EDGE PLAY · full daily card · 21+" })
      .setTimestamp();
    return e;
  });
  // Discord allows up to 10 embeds per message; split if needed
  const out = [];
  for (let i = 0; i < embeds.length; i += 10) {
    out.push({ embeds: embeds.slice(i, i + 10) });
  }
  return out;
}

export async function eveningBundle() {
  const board = getCurrentBoard() || getLastBoard();
  const e = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🌆 EVENING REVIEW")
    .setDescription(
      board
        ? (board.text || "").slice(0, 3200) +
          "\n\n_Auto-grade runs from ESPN finals for pending ML picks. Manual: `/pending` then `/grade`._"
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
    } else if (u.type === "AUTO_GRADE") {
      out.push({
        content: "✅ **AUTO-GRADED**",
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ AUTO-GRADE")
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
