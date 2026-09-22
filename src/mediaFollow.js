/**
 * Media / tout follow desk — track what media is on, map to our action
 * Background: optional poll stub when EDGE_PLAY_API exposes /api/media
 */
import { EmbedBuilder } from "discord.js";
import { liveCard } from "./data/desk.js";
import { config } from "./config.js";

const { colors } = config;
const BASE = (config.apiBase || "").replace(/\/$/, "");

export async function fetchMediaFeed() {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/media`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function leanEmbed() {
  const rows = liveCard.leanBoard || [];
  const e = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("➖ LEANS · WHO TO LEAN")
    .setDescription(
      rows.length
        ? "Small size only. **Who** + **only if** the price is right."
        : "No leans active."
    )
    .setFooter({ text: "EDGE PLAY · LEAN ≠ LOCK · 0.25u · 21+" })
    .setTimestamp();

  for (const r of rows) {
    e.addFields({
      name: `➖ LEAN · ${r.who}`,
      value:
        `**vs** ${r.vs}\n` +
        `**Only if:** ${r.onlyIf}\n` +
        `**Size:** ${r.units}u\n` +
        `**Why:** ${r.why}`,
      inline: false
    });
  }
  return e;
}

export function holdEmbed() {
  const rows = liveCard.holdBoard || [];
  const e = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("⏸️ HOLDS · WHO TO HOLD")
    .setDescription(
      "Interest is real — **ticket is not**. Wait for the trigger."
    )
    .setFooter({ text: "EDGE PLAY · HOLD = no bet yet · 21+" })
    .setTimestamp();

  for (const r of rows) {
    e.addFields({
      name: `⏸️ HOLD · ${r.who}`,
      value:
        `**vs** ${r.vs}\n` +
        `**Wait for:** ${r.waitFor}\n` +
        `**Why:** ${r.why}`,
      inline: false
    });
  }
  return e;
}

export async function mediaFollowEmbed() {
  const local = liveCard.mediaFollow || [];
  const api = await fetchMediaFeed();

  const e = new EmbedBuilder()
    .setColor(colors.navy)
    .setTitle("📡 MEDIA FOLLOW · WHAT THEY'RE ON")
    .setDescription(
      "Track media / touts → **map to our size**. We don't copy their units."
    )
    .setFooter({ text: "EDGE PLAY · media = signal · desk = size · 21+" })
    .setTimestamp();

  for (const m of local) {
    e.addFields({
      name: `📡 ${m.handle}`,
      value: `**Rule:** ${m.rule}\n**Our map:** \`${m.map}\``,
      inline: false
    });
  }

  if (api?.items?.length) {
    e.addFields({
      name: "🔴 LIVE MEDIA FEED (API)",
      value: api.items
        .slice(0, 8)
        .map(
          (i) =>
            `**${i.source || "media"}** — ${i.pick || i.text}\n→ \`${i.map || "HOLD"}\``
        )
        .join("\n\n")
        .slice(0, 1000),
      inline: false
    });
  } else {
    e.addFields({
      name: "API",
      value:
        "Background `/api/media` offline — using static media maps. " +
        "When OpticOdds/backend exposes media, it shows here.",
      inline: false
    });
  }

  return e;
}
