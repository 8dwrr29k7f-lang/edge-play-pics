import { EmbedBuilder } from "discord.js";
import { lockOfTheDay, liveCard } from "./data/desk.js";
import { config } from "./config.js";
import {
  standardizePick,
  formatStandardDiscord,
  formatParlayDiscord
} from "./pickFormat.js";

const { colors } = config;

export function lotdEmbed() {
  const L = lockOfTheDay || {};
  const asPick = {
    selection: (L.pick || L.selection || "").replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim() || L.pick,
    game: L.match || L.event || L.game,
    sport: L.sport,
    tier: "LOCK", // input hint only — engine decides real level
    price: L.priceGuide || L.odds || L.price,
    units: L.units,
    reasoning: L.analysis || L.reasoning,
    form: L.form,
    supporting: L.why,
    type: "ml"
  };
  const std = standardizePick(asPick, { lotd: true });
  const body = formatStandardDiscord(std);
  const title = std.noPick
    ? "🔴 NO PLAY · DESK CHECK"
    : std.playLevel === "STRONG PLAY"
      ? "🟢 STRONG PLAY · TOP SPOT"
      : std.playLevel === "LEAN"
        ? "🟡 LEAN · PROCESS SIDE"
        : "🎯 PROCESS CARD";
  return new EmbedBuilder()
    .setColor(std.noPick ? 0xe74c3c : std.playLevel === "STRONG PLAY" ? 0x2ecc71 : 0xf1c40f)
    .setTitle(title)
    .setDescription(body.slice(0, 4000))
    .setFooter({ text: `${L.date || ""} · EDGE PLAY · never force a lock · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard || { picks: [] };
  const e = new EmbedBuilder()
    .setColor(colors?.gold || 0xc4a35a)
    .setTitle("📡 LIVE CARD · EVIDENCE ENGINE")
    .setDescription(`**${c.dateLabel || "TODAY"}**\nEngine output: 🟢 STRONG · 🟡 LEAN · 🔴 NO PLAY`)
    .setFooter({ text: "EDGE PLAY · multi-factor · never force locks · 21+" })
    .setTimestamp();
  const picks = (c.picks || []).filter((p) =>
    ["LOCK", "CAP", "VALUE", "LEAN", "STRONG"].includes((p.tier || "").toUpperCase())
  );
  if (!picks.length) {
    e.setDescription("🔴 NO PLAY board yet.\nREASON: Empty desk or insufficient evidence. Never invent locks.");
    return e;
  }
  for (const p of picks.slice(0, 8)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${std.playEmoji || "🎯"} ${std.playLevel || p.tier} · ${p.sport}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export function locksTodayEmbed() {
  const e = new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("🔒 PROCESS PLAYS · EVIDENCE CARDS")
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY · clear FINAL · never force · 21+" });
  if (lockOfTheDay?.pick || lockOfTheDay?.selection) {
    const asPick = {
      selection: String(lockOfTheDay.pick || lockOfTheDay.selection).replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim(),
      game: lockOfTheDay.match || lockOfTheDay.event || lockOfTheDay.game,
      sport: lockOfTheDay.sport,
      tier: "LOCK",
      price: lockOfTheDay.priceGuide || lockOfTheDay.odds || lockOfTheDay.price,
      units: lockOfTheDay.units,
      reasoning: lockOfTheDay.analysis || lockOfTheDay.reasoning,
      supporting: lockOfTheDay.why,
      type: "ml"
    };
    const std = standardizePick(asPick, { lotd: true });
    e.addFields({
      name: `${std.playEmoji || "🎯"} TOP SPOT · ${std.playLevel}`,
      value: formatStandardDiscord(std).slice(0, 1020),
      inline: false
    });
  }
  const locks = (liveCard?.picks || []).filter((p) => p.tier === "LOCK" || p.tier === "CAP" || p.potd);
  const values = (liveCard?.picks || []).filter((p) => p.tier === "VALUE" || p.tier === "LEAN");
  for (const p of locks.slice(0, 4)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${std.playEmoji || "🔒"} ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std).slice(0, 1020),
      inline: false
    });
  }
  for (const p of values.slice(0, 5)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${std.playEmoji || "🎯"} ${std.playLevel} · ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  if (!lockOfTheDay?.pick && !lockOfTheDay?.selection && !locks.length && !values.length) {
    e.setDescription("🔴 FINAL: NO PLAY\nREASON: Empty desk — run `/daily`. Engine will not invent locks.");
  }
  return e;
}

export function valueBoardEmbed() {
  const values = (liveCard?.picks || []).filter((p) => p.tier === "VALUE" || p.tier === "LEAN");
  const e = new EmbedBuilder().setColor(0x3498db).setTitle("💎 VALUE / LEAN · EVIDENCE").setFooter({ text: "VALUE · 21+" }).setTimestamp();
  if (!values.length) {
    e.setDescription("🔴 NO PLAY — run `/daily`.");
    return e;
  }
  for (const p of values.slice(0, 6)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${std.playEmoji || "💎"} ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export function propsEmbed() {
  const rows = liveCard?.playerPicks || [];
  const e = new EmbedBuilder().setColor(0x9b59b6).setTitle("👤 PLAYER PROPS").setFooter({ text: "props · 21+" }).setTimestamp();
  if (!rows.length) {
    e.setDescription("🔴 FINAL: NO PLAY\nREASON: No prop board with usage + number.");
    return e;
  }
  for (const x of rows) {
    const std = standardizePick({
      selection: `${x.player} ${x.market} ${x.side}`,
      sport: x.sport,
      tier: x.tier,
      price: x.odds || x.price,
      units: x.units,
      form: x.note,
      supporting: x.note
    });
    e.addFields({
      name: `${std.playEmoji || x.tier} · ${x.sport}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export function parlaysEmbed() {
  const rows = liveCard?.parlays || [];
  const e = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🔗 PARLAYS")
    .setDescription("Each leg analyzed alone first. Combined probability compounds risk. Engine may reject legs.")
    .setFooter({ text: "parlays · 21+" })
    .setTimestamp();
  const legs = (liveCard?.picks || [])
    .filter((p) => ["LEAN", "VALUE", "LOCK", "STRONG"].includes(p.tier) && !p.final)
    .slice(0, 2);
  if (legs.length >= 2) {
    e.addFields({
      name: "✅ PROCESS 2-LEG (desk)",
      value: formatParlayDiscord(legs).slice(0, 1020),
      inline: false
    });
  }
  for (const p of rows) {
    e.addFields({
      name: `${p.name}`.slice(0, 256),
      value: `Legs: ${(p.legs || []).join(" · ")}\n**${p.tier}** · ${p.units}u\n_${p.note}_`.slice(0, 1020),
      inline: false
    });
  }
  if (!legs.length && !rows.length) {
    e.setDescription("🔴 NO PLAY parlay — need two LEAN+ legs that survive the engine.");
  }
  return e;
}
