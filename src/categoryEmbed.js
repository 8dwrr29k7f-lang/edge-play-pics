/**
 * Category Discord embeds — always live pipeline, never static fake picks.
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { runCategoryPipeline, runAllLiveCategories, registrySummary } from "./categoryPipeline.js";
import { getCategory, CATEGORY_REGISTRY } from "./categoryRegistry.js";

const { colors } = config;

function formatPickBlock(p) {
  const lines = [
    `🎯 **${p.selection}** · ${p.game}`,
    `📊 Model: ${p.probabilityPct != null ? p.probabilityPct + "%" : "—"} · 💰 ${p.price || "—"} · 📈 Edge: ${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}`,
    `📡 DQ: ${p.dataQuality || "—"} · ${p.playEmoji || ""} ${p.playLevel || p.tier}`
  ];
  if (p.top3?.length) lines.push("Why: " + p.top3.slice(0, 2).join("; "));
  if (p.biggestRisk) lines.push(`Risk: ${p.biggestRisk}`);
  return lines.join("\n").slice(0, 1000);
}

/**
 * Live category desk embed — async, always returns an embed.
 */
export async function categoryEmbed(key) {
  const result = await runCategoryPipeline(key);
  const cat = getCategory(key) || {
    emoji: result.emoji,
    label: result.label,
    factors: []
  };

  const color =
    result.status === "LIVE"
      ? result.locks?.length
        ? 0x2ecc71
        : 0xc4a35a
      : result.status === "GUIDANCE_ONLY"
        ? 0x3498db
        : 0x95a5a6;

  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${result.emoji || cat.emoji} ${result.label} · DESK`)
    .setTimestamp()
    .setFooter({
      text: `EDGE PLAY · ${result.dataStatus || "—"} · verified ${result.stamp || ""} · 21+`
    });

  // Chain status line
  const ch = result.chain || {};
  const chainLine = [
    ch.category ? "✅CAT" : "❌CAT",
    ch.data ? "✅DATA" : "❌DATA",
    ch.model ? "✅MODEL" : "❌MODEL",
    ch.analysis ? "✅ANAL" : "❌ANAL",
    ch.pick ? "✅PICK" : "⚪PICK",
    ch.display ? "✅DISP" : "❌DISP",
    ch.history ? "✅HIST" : "⚪HIST"
  ].join(" · ");

  if (result.noVerifiedPick) {
    e.setDescription(
      [
        "**🚫 NO VERIFIED PICK**",
        "",
        `**Reason:** ${result.reason || "Insufficient reliable data"}`,
        "",
        `Events scanned: ${result.eventsScanned ?? 0}`,
        `Candidates analyzed: ${result.candidatesAnalyzed ?? 0}`,
        result.factors?.length ? `Sport factors: ${result.factors.join(", ")}` : null,
        "",
        `🕐 CREATED: ${result.created || "—"}`,
        `🔄 LAST VERIFIED: ${result.lastVerified || result.stamp || "—"}`,
        `📡 DATA STATUS: ${result.dataStatus || "—"}`,
        "",
        `Chain: ${chainLine}`,
        "",
        "_Engine refuses to invent a pick. Log manually with `/logpick` if you have independent evidence._"
      ]
        .filter((x) => x != null)
        .join("\n")
        .slice(0, 4000)
    );

    if (result.rejectedSample?.length) {
      e.addFields({
        name: "Sample rejects (evidence bar)",
        value: result.rejectedSample
          .map((r) => `• ${r.selection} (${r.game}): ${r.reason}`)
          .join("\n")
          .slice(0, 1000),
        inline: false
      });
    }
    if (result.errors?.length) {
      e.addFields({
        name: "Feed notes",
        value: result.errors.slice(0, 3).join("\n").slice(0, 500),
        inline: false
      });
    }
    return e;
  }

  e.setDescription(
    [
      `**Status:** ${result.status} · ${result.eventsScanned} events · ${result.candidatesAnalyzed} sides`,
      result.factors?.length ? `**Factors:** ${result.factors.join(", ")}` : null,
      `🕐 CREATED: ${result.created}`,
      `🔄 LAST VERIFIED: ${result.lastVerified}`,
      `📡 ${result.dataStatus}`,
      `Chain: ${chainLine}`
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (result.locks?.length) {
    for (const p of result.locks.slice(0, 4)) {
      e.addFields({
        name: `🔒 LOCK · ${p.selection}`.slice(0, 256),
        value: formatPickBlock(p),
        inline: false
      });
    }
  } else {
    e.addFields({
      name: "🔒 LOCKS",
      value: "**NO VERIFIED LOCK** — none cleared strict LOCK bar for this sport today.",
      inline: false
    });
  }

  if (result.leans?.length) {
    for (const p of result.leans.slice(0, 5)) {
      e.addFields({
        name: `➖ LEAN · ${p.selection}`.slice(0, 256),
        value: formatPickBlock(p),
        inline: false
      });
    }
  } else {
    e.addFields({
      name: "➖ LEANS",
      value: "**NO VERIFIED LEAN** on this desk after analysis.",
      inline: false
    });
  }

  return e;
}

/** Sync fallback for code that still expects sync — prefer async categoryEmbed */
export function categoryEmbedSync(key) {
  const cat = getCategory(key);
  if (!cat) return null;
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`${cat.emoji} ${cat.label} · DESK`)
    .setDescription(
      "Use the live async desk path. If you see this, call `await categoryEmbed(key)`."
    )
    .setTimestamp();
}

export async function bestOverallEmbed() {
  const results = await runAllLiveCategories();
  const lines = [];
  for (const r of results) {
    if (r.noVerifiedPick) {
      lines.push(`**${r.emoji} ${r.label}**\n🚫 NO VERIFIED PICK — ${r.reason}`);
    } else {
      const head = r.locks[0] || r.leans[0];
      lines.push(
        `**${r.emoji} ${r.label}**\n${head.playEmoji || "🎯"} ${head.selection} · ${head.game}\n_${head.probabilityPct}% · ${head.price || "—"} · ${head.tier}_`
      );
    }
  }
  // Also list offline categories so nothing is hidden
  for (const c of Object.values(CATEGORY_REGISTRY)) {
    if (c.liveEnabled) continue;
    if (c.key === "kalshi") continue;
    lines.push(`**${c.emoji} ${c.label}**\n🚫 NO VERIFIED PICK — ${c.noFeedReason || "no feed"}`);
  }

  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("⭐ BEST TAKES · ALL CATEGORIES")
    .setDescription(lines.join("\n\n").slice(0, 4000) || "No categories.")
    .setFooter({ text: "EDGE PLAY · every category visible · 21+" })
    .setTimestamp();
}

export async function allLocksEmbed() {
  const results = await runAllLiveCategories();
  const parts = [];
  for (const r of results) {
    if (!r.locks?.length) continue;
    parts.push(
      `**${r.emoji} ${r.label}**\n` +
        r.locks.map((l) => `🔒 ${l.selection} · ${l.price || "—"} · ${l.probabilityPct}%`).join("\n")
    );
  }
  return new EmbedBuilder()
    .setColor(colors.lock || 0xf1c40f)
    .setTitle("🔒 LOCKS · ALL LIVE CATEGORIES")
    .setDescription(
      (parts.join("\n\n") || "No verified LOCKs across categories — silence is correct.").slice(
        0,
        4000
      )
    )
    .setFooter({ text: "Evidence-first · 21+" })
    .setTimestamp();
}

export function registryEmbed() {
  const rows = registrySummary();
  return new EmbedBuilder()
    .setColor(colors.navy || 0x0a1628)
    .setTitle("📋 CATEGORY REGISTRY")
    .setDescription(
      rows
        .map(
          (r) =>
            `**${r.key}** ${r.command} · live=${r.live ? "yes" : "no"} · feed=${r.feed} · mkt=${r.markets}`
        )
        .join("\n")
        .slice(0, 4000)
    )
    .setFooter({ text: "Master registry · 21+" })
    .setTimestamp();
}

export function mediaAllEmbed() {
  return new EmbedBuilder()
    .setColor(colors.navy)
    .setTitle("📡 MEDIA BETS · ALL SPORTS")
    .setDescription(
      "Media board is signal-only. Category desks use the live pipeline — run `/mlb` `/nfl` … or `/best`."
    )
    .setFooter({ text: "Media ≠ verified pick · 21+" })
    .setTimestamp();
}
