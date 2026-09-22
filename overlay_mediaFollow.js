import { EmbedBuilder } from "discord.js";
import { liveCard, categories } from "./data/desk.js";
import { config } from "./config.js";

const { colors } = config;
const BASE = (config.apiBase || "").replace(/\/$/, "");

export const MEDIA_SOURCES = [
  { platform: "X", handle: "@McAfeeBets / sharp X accounts", typical: "NFL/MLB sides + props", howToUse: "Public signal only. Heavy chalk → HOLD/PASS." },
  { platform: "X", handle: "Consensus tweet sheets", typical: "Same side on every timeline", howToUse: "70%+ media on one side → often PASS or fade tax." },
  { platform: "Instagram", handle: "Story / reel lock pages", typical: "5–10 locks per day", howToUse: "Never copy units. Run each through /live process." },
  { platform: "Instagram", handle: "Prop graphic pages", typical: "Player props stacked", howToUse: "Need usage + number. Default HOLD." },
  { platform: "Telegram", handle: "VIP / max lock channels", typical: "Paid locks + parlays", howToUse: "Highest noise. HOLD; promote only if price + film clear." },
  { platform: "Telegram", handle: "Free pick dump groups", typical: "Volume over edge", howToUse: "Track if you want — desk sizes 0–0.25u max if any play." }
];

export async function fetchMediaFeed() {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/media`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export function leanEmbed() {
  const rows = liveCard.leanBoard || [];
  const e = new EmbedBuilder().setColor(0xe67e22).setTitle("➖ LEANS · WHO TO LEAN")
    .setDescription(rows.length ? "Small size only." : "No leans — /daily then /live.")
    .setFooter({ text: "LEAN ≠ LOCK · 0.25u · 21+" }).setTimestamp();
  for (const r of rows) e.addFields({ name: `➖ LEAN · ${r.who}`, value: `**vs** ${r.vs}\n**Only if:** ${r.onlyIf}\n**${r.units}u** · ${r.why}`, inline: false });
  return e;
}

export function holdEmbed() {
  const rows = liveCard.holdBoard || [];
  const e = new EmbedBuilder().setColor(0x95a5a6).setTitle("⏸️ HOLDS").setDescription("No ticket yet.").setFooter({ text: "21+" }).setTimestamp();
  for (const r of rows) e.addFields({ name: `⏸️ HOLD · ${r.who}`, value: `**vs** ${r.vs}\n**Wait:** ${r.waitFor}\n${r.why}`, inline: false });
  return e;
}

export async function mediaFollowEmbed(platformFilter = null) {
  const local = liveCard.mediaFollow || [];
  const api = await fetchMediaFeed();
  const filter = (platformFilter || "").toLowerCase();
  const e = new EmbedBuilder()
    .setColor(colors.navy || 0x1a2332)
    .setTitle("📡 MEDIA FOLLOW · IG · X · TELEGRAM")
    .setDescription(
      "**Your choice what to track.** Media “will win” ≠ auto TAKE.\n" +
      "Map → ✅ TAKE · 💎 VALUE · ➖ LEAN · ⏸️ HOLD · 🚫 PASS"
    )
    .setFooter({ text: "media = signal · you choose · desk = size · 21+" })
    .setTimestamp();

  let sources = MEDIA_SOURCES;
  if (filter.includes("insta")) sources = sources.filter((s) => s.platform === "Instagram");
  else if (filter === "x" || filter.includes("twitter")) sources = sources.filter((s) => s.platform === "X");
  else if (filter.includes("tele")) sources = sources.filter((s) => s.platform === "Telegram");

  e.addFields({
    name: "📱 SOURCES YOU CAN FOLLOW",
    value: sources.map((s) => `**${s.platform}** · ${s.handle}\nPosts: ${s.typical}\nUse: ${s.howToUse}`).join("\n\n").slice(0, 1000),
    inline: false
  });

  e.addFields({
    name: "🗺️ DESK MAP RULES",
    value: local.length
      ? local.map((m) => `**${m.handle}**\n${m.rule}\n→ \`${m.map}\``).join("\n\n").slice(0, 1000)
      : "Chalk ≥65¢ → HOLD/PASS · Never copy their units",
    inline: false
  });

  const sportLines = [];
  for (const cat of Object.values(categories || {})) {
    if (!cat.mediaBets?.length) continue;
    for (const m of cat.mediaBets.slice(0, 2)) {
      sportLines.push(`**${cat.label}** · ${m.source}: ${m.bet} → \`${m.map}\``);
    }
  }
  if (sportLines.length) {
    e.addFields({ name: "🏆 BY SPORT", value: sportLines.join("\n").slice(0, 1000), inline: false });
  }

  e.addFields({
    name: "✅ HOW TO USE (YOUR CHOICE)",
    value:
      "1. See a lock on **IG / X / TG**\n" +
      "2. Check `/live` — on our card?\n" +
      "3. If LOCK/VALUE → optional take at **our** units\n" +
      "4. Media-only hype → **PASS**\n" +
      "5. `/logpick` if you fire",
    inline: false
  });

  if (api?.items?.length) {
    e.addFields({
      name: "🔴 LIVE FEED",
      value: api.items.slice(0, 8).map((i) => `**${i.source || i.platform || "media"}** — ${i.pick || i.text}\n→ \`${i.map || "HOLD"}\``).join("\n\n").slice(0, 1000),
      inline: false
    });
  }
  return e;
}
