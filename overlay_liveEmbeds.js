/**
 * Live picks embeds — OpticOdds when API is up; DESK named card when offline.
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { fetchBestBets, fetchPL } from "./liveApi.js";
import { categories, liveCard, lockOfTheDay } from "./data/desk.js";

const { colors } = config;

function base(color = colors.navy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "⚡ EDGE PLAY PICS · clear TAKE / PASS · 21+" });
}

const TIER_EMOJI = {
  LOCK: "🔒", CAP: "✅", VALUE: "💎", LEAN: "➖", WATCH: "👀",
  PASS: "🚫", FADE: "❌", HOLD: "⏸️"
};

function formatPrice(p) {
  if (p == null || p === 0) return "—";
  if (typeof p === "string") return p;
  return p > 0 ? `+${p}` : `${p}`;
}

function actionLine(p) {
  const price = formatPrice(p.price);
  const tier = (p.tier || "VALUE").toUpperCase();
  if (tier === "LOCK" || tier === "CAP")
    return `✅ **TAKE THIS · ${tier}** → **${p.selection}** ${price} · **${p.units}u** · ${p.book || "shop"}`;
  if (tier === "VALUE")
    return `💎 **TAKE (VALUE)** → **${p.selection}** ${price} · **${p.units}u**`;
  if (tier === "LEAN")
    return `➖ **TAKE LEAN** → **${p.selection}** ${price} · **${p.units}u**`;
  if (tier === "HOLD") return `⏸️ **HOLD** → ${p.selection} ${price}`;
  return `🚫 **PASS** → ${p.selection} ${price}`;
}

function deskPicks() {
  return (liveCard?.picks || []).filter(Boolean);
}

function deskFallbackBanner() {
  return (
    "_Odds API offline — using **desk named card** (ESPN + process). " +
    "Set EDGE_PLAY_API when OpticOdds backend is up for live lines._\n\n"
  );
}

function analysisSnippet(p) {
  const r = p.reasoning || {};
  if (r.form || r.decision) {
    return `**Form:** ${r.form || "—"}\n**Spot:** ${r.situational || "—"}\n**Call:** ${r.decision || p.why || "—"}`;
  }
  return p.why ? `_${p.why}_` : "";
}

export async function liveBestBetsEmbed() {
  const data = await fetchBestBets();
  if (data?.picks?.length) {
    const locks = data.picks.filter((p) => p.tier === "LOCK" || p.tier === "CAP");
    const rest = data.picks.filter((p) => p.tier !== "LOCK" && p.tier !== "CAP");
    const e = base(0xf4d03f).setTitle("🔥 EDGE PLAY · WHAT TO TAKE");
    let desc = `**${data.total_picks} bets · ${data.total_units}u · ${data.sports_count} sports**\n${data.generated_at || ""}\n\n`;
    if (locks.length) {
      desc += "### 🔒 CLEAR LOCKS — TAKE THESE\n" + locks.map(actionLine).join("\n") + "\n\n";
    }
    e.setDescription(desc.slice(0, 2000));
    for (const p of locks.slice(0, 6)) {
      e.addFields({
        name: `${TIER_EMOJI[p.tier] || "🔒"} ${p.tier} · ${p.sport_name} · ${formatPrice(p.price)}`,
        value: `**TAKE: ${p.selection}** · ${p.units}u · ${p.book}\n${p.game}\n_${p.analysis || ""}_`,
        inline: false
      });
    }
    for (const p of rest.slice(0, 6)) {
      e.addFields({
        name: `${TIER_EMOJI[p.tier] || "📊"} ${p.tier} · ${p.sport_name} · ${p.selection}`,
        value: `${p.game} · ${p.units}u · ${p.analysis || ""}`.slice(0, 300),
        inline: false
      });
    }
    return e;
  }

  const picks = deskPicks();
  const e = base(colors.gold).setTitle("⭐ BEST TAKES · DESK CARD");
  let desc = deskFallbackBanner();
  if (lockOfTheDay?.pick) {
    desc += `### 👑 LOCK OF THE DAY\n✅ **${lockOfTheDay.pick}**\n${lockOfTheDay.match || lockOfTheDay.event || ""}\n**Price:** ${lockOfTheDay.priceGuide} · **${lockOfTheDay.units}u**\n\n`;
  }
  if (picks.length) {
    const takeable = picks.filter((p) => ["LOCK", "CAP", "VALUE", "LEAN"].includes((p.tier || "").toUpperCase()));
    desc += `### 📡 NAMED PICKS (${takeable.length} takeable)\n` + takeable.slice(0, 8).map(actionLine).join("\n") + "\n\n_Run `/daily` then `/lotd` for full analysis._";
  } else {
    desc += "**No desk picks yet.** Run **`/daily`** to roll ESPN slate + LOCK OF THE DAY.\n\n";
    desc += Object.values(categories).map((c) => `**${c.emoji} ${c.label}**\n✅ ${c.best?.pick || "—"}\n_${c.best?.odds} · ${c.best?.size}_`).join("\n\n");
  }
  e.setDescription(desc.slice(0, 4000));
  for (const p of picks.filter((x) => ["LOCK", "VALUE", "LEAN"].includes((x.tier || "").toUpperCase())).slice(0, 6)) {
    e.addFields({
      name: `${TIER_EMOJI[p.tier] || "📊"} ${p.tier} · ${p.sport}`,
      value: (`${actionLine(p)}\n**${p.game}**\n` + analysisSnippet(p)).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

function deskLocksEmbed(deskLocks, offline) {
  const e = base(0xf4d03f).setTitle("🔒 LOCKS · DESK CARD");
  let desc = offline ? deskFallbackBanner() : "";
  if (lockOfTheDay?.pick) {
    const a = lockOfTheDay.analysis || {};
    desc += `### 👑 LOCK OF THE DAY\n✅ **${lockOfTheDay.pick}**\n${lockOfTheDay.match || ""}\n**Price:** ${lockOfTheDay.priceGuide} · **${lockOfTheDay.units}u**\n**Form:** ${a.form || "—"}\n**Call:** ${a.prediction || a.decision || "—"}\n\n`;
  }
  if (!deskLocks.length && !lockOfTheDay?.pick) {
    return e.setDescription(desc + "**No named locks yet.** Run **`/daily`** then **`/lotd`**.");
  }
  desc += `**${deskLocks.length} desk take(s)**\n\n` + deskLocks.slice(0, 10).map((p, i) => `**${i + 1}.** ${actionLine(p)}`).join("\n\n");
  e.setDescription(desc.slice(0, 2000));
  for (const p of deskLocks.slice(0, 8)) {
    e.addFields({
      name: `${TIER_EMOJI[p.tier] || "🔒"} ${p.tier} · ${p.sport}`,
      value: (`✅ **${p.selection}** · ${p.price} · **${p.units}u**\n**${p.game}**\n` + analysisSnippet(p)).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export async function liveLocksEmbed() {
  const data = await fetchBestBets();
  if (data?.picks) {
    const locks = data.picks.filter((p) => p.tier === "LOCK" || p.tier === "CAP");
    if (locks.length === 0) {
      const deskLocks = deskPicks().filter((p) => p.tier === "LOCK" || p.tier === "CAP" || p.potd);
      if (deskLocks.length) return deskLocksEmbed(deskLocks, false);
      return base(colors.gold).setTitle("🔒 LOCKS").setDescription("Live feed: no LOCK/CAP. Run `/daily` for desk LOCK OF THE DAY.");
    }
    const totalU = locks.reduce((s, p) => s + (p.units || 0), 0);
    const e = base(0xf4d03f).setTitle("🔒 LOCKS — TAKE THESE").setDescription(`**${locks.length} take(s) · ${totalU}u**\n\n` + locks.map((p, i) => `**${i + 1}.** ${actionLine(p)}`).join("\n\n"));
    for (const p of locks.slice(0, 8)) {
      e.addFields({
        name: `${TIER_EMOJI[p.tier]} ${p.tier} · ${p.sport_name}`,
        value: `✅ **TAKE ${p.selection}** ${formatPrice(p.price)}\n**Game:** ${p.game}\n**Size:** ${p.units}u\n**Why:** ${p.analysis || "edge"}`,
        inline: false
      });
    }
    return e;
  }
  const deskLocks = deskPicks().filter((p) => ["LOCK", "CAP", "VALUE", "LEAN"].includes(p.tier) || p.potd);
  return deskLocksEmbed(deskLocks, true);
}

export async function livePLEmbed() {
  const data = await fetchPL();
  if (!data) {
    return base(colors.gold).setTitle("📊 P/L TRACKER").setDescription(deskFallbackBanner() + "Use **`/track`** for the ledger.");
  }
  const color = (data.roi || 0) >= 0 ? 0x2ecc71 : 0xe74c3c;
  return base(color).setTitle("📊 EDGE PLAY · P/L").setDescription(`**Record:** ${data.wins}W - ${data.losses}L - ${data.pushes}P\n**Units:** ${data.total_units >= 0 ? "+" : ""}${Number(data.total_units).toFixed(1)}u\n**ROI:** ${data.roi >= 0 ? "+" : ""}${Number(data.roi).toFixed(1)}%`);
}

export async function liveAllPicksEmbed() {
  const data = await fetchBestBets();
  if (data?.picks?.length) {
    return base(colors.navy).setTitle("📊 ALL PICKS").setDescription(`**${data.total_picks} picks · ${data.total_units}u**\n\n` + data.picks.slice(0, 12).map(actionLine).join("\n").slice(0, 3500));
  }
  const picks = deskPicks();
  if (!picks.length) return liveBestBetsEmbed();
  return base(colors.navy).setTitle("📊 ALL PICKS · DESK CARD").setDescription((deskFallbackBanner() + `**${picks.length} named picks**\n\n` + picks.slice(0, 12).map(actionLine).join("\n")).slice(0, 4000));
}
