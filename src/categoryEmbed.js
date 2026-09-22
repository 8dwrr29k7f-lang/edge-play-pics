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
    .setDescription(
      `**Kalshi:** ${c.kalshi}\n**Media overall:** ${c.mediaOverall}`
    )
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY PICS · clear locks · 21+" });

  e.addFields({
    name: `⭐ ${c.best.title}`,
    value: `**${c.best.pick}**\nOdds: ${c.best.odds}\nSize: ${c.best.size}\n${c.best.why}`,
    inline: false
  });

  if (c.locks.length) {
    e.addFields({
      name: "🔒 CLEAR LOCKS — only take if price matches",
      value: c.locks
        .map(
          (l) =>
            `**${l.tier}** — ${l.pick}\n${l.odds} · ${l.size}\n_${l.note}_`
        )
        .join("\n\n")
        .slice(0, 1000),
      inline: false
    });
  } else {
    e.addFields({
      name: "🔒 CLEAR LOCKS — only take if price matches",
      value: "**PASS** — no named lock on this desk. Wait for live LOCK/CAP.",
      inline: false
    });
  }

  if (c.leans?.length) {
    e.addFields({
      name: "➖ LEANS",
      value: c.leans.map((x) => `• ${x}`).join("\n"),
      inline: false
    });
  }
  if (c.pass?.length) {
    e.addFields({
      name: "🚫 PASS",
      value: c.pass.map((x) => `• ${x}`).join("\n"),
      inline: false
    });
  }
  if (c.mediaBets?.length) {
    e.addFields({
      name: "📡 MEDIA BETS",
      value: c.mediaBets
        .map((m) => `**${m.source}** — ${m.bet}\n→ \`${m.map}\``)
        .join("\n\n")
        .slice(0, 900),
      inline: false
    });
  }
  return e;
}

export function bestOverallEmbed() {
  const lines = Object.values(categories).map(
    (c) =>
      `**${c.emoji} ${c.label}**\n${c.best.pick}\n_${c.best.odds} · ${c.best.size}_`
  );
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("⭐ BEST TAKES · PROCESS BY SPORT")
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setFooter({ text: "EDGE PLAY PICS · /kbo /mlb /tennis … · 21+" })
    .setTimestamp();
}

export function allLocksEmbed() {
  const parts = [];
  for (const c of Object.values(categories)) {
    if (!c.locks.length) continue;
    parts.push(
      `**${c.emoji} ${c.label}**\n` +
        c.locks.map((l) => `🔒 ${l.pick} · ${l.odds} · ${l.size}`).join("\n")
    );
  }
  return new EmbedBuilder()
    .setColor(colors.lock || 0xf1c40f)
    .setTitle("🔒 CLEAR LOCKS · ALL CATEGORIES")
    .setDescription(
      (parts.join("\n\n") || "No clear locks active — silence is premium.").slice(
        0,
        4000
      )
    )
    .setFooter({ text: "Auto-posts only when EXCLUSIVE id is live · 21+" })
    .setTimestamp();
}

export function mediaAllEmbed() {
  const lines = Object.values(categories).map((c) => {
    const bets = (c.mediaBets || [])
      .map((m) => `• ${m.source}: ${m.bet} (\`${m.map}\`)`)
      .join("\n");
    return `**${c.emoji} ${c.label}**\n${c.mediaOverall}\n${bets}`;
  });
  return new EmbedBuilder()
    .setColor(colors.navy)
    .setTitle("📡 MEDIA BETS · ALL SPORTS")
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setFooter({ text: "Media = signal · size yourself · 21+" })
    .setTimestamp();
}
