import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { categories } from "./data/desk.js";

const { colors } = config;

export function categoryEmbed(key) {
  const c = categories[key];
  if (!c) return null;
  const e = new EmbedBuilder()
    .setColor(colors.gold)
    .setTitle(`${c.emoji} ${c.label} · DESK`)
    .setDescription(`**Kalshi:** ${c.kalshi}\n**Media overall:** ${c.mediaOverall}`)
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY PICS · clear TAKEs · 21+" });

  e.addFields({
    name: `⭐ ${c.best.title}`,
    value: `**${c.best.pick}**\nOdds: ${c.best.odds}\nSize: ${c.best.size}\n${c.best.why}`,
    inline: false
  });

  if (c.locks?.length) {
    e.addFields({
      name: "✅ LOCKS & TAKES — price must match",
      value: c.locks
        .map((l) => `**${l.tier}** — ${l.pick}\n${l.odds} · ${l.size}\n_${l.note}_`)
        .join("\n\n")
        .slice(0, 1000),
      inline: false
    });
  } else {
    e.addFields({
      name: "🔒 LOCKS / TAKES",
      value: "Run `/daily` then this sport again — best TAKE stamps from live slate.\nPrimary: `/lotd`",
      inline: false
    });
  }

  if (c.leans?.length) {
    e.addFields({ name: "➖ LEANS", value: c.leans.map((x) => `• ${x}`).join("\n"), inline: false });
  }
  if (c.pass?.length) {
    e.addFields({ name: "🚫 PASS", value: c.pass.map((x) => `• ${x}`).join("\n"), inline: false });
  }
  if (c.mediaBets?.length) {
    e.addFields({
      name: "📡 MEDIA BETS",
      value: c.mediaBets.map((m) => `**${m.source}** — ${m.bet}\n→ \`${m.map}\``).join("\n\n").slice(0, 900),
      inline: false
    });
  }
  return e;
}

export function bestOverallEmbed() {
  const lines = Object.values(categories).map(
    (c) => `**${c.emoji} ${c.label}**\n${c.best.pick}\n_${c.best.odds} · ${c.best.size}_`
  );
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("⭐ BEST TAKES · BY SPORT")
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setFooter({ text: "EDGE PLAY · 21+" })
    .setTimestamp();
}

export function allLocksEmbed() {
  return bestOverallEmbed().setTitle("🔒 ALL CATEGORY TAKES");
}

export function mediaAllEmbed() {
  const lines = [];
  for (const c of Object.values(categories)) {
    if (!c.mediaBets?.length) continue;
    lines.push(`**${c.label}**`);
    for (const m of c.mediaBets) lines.push(`• ${m.source}: ${m.bet} → ${m.map}`);
  }
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📡 MEDIA MAP · ALL SPORTS")
    .setDescription(lines.join("\n").slice(0, 4000) || "No media rows")
    .setTimestamp();
}
