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
    tier: "LOCK",
    price: L.priceGuide || L.odds || L.price,
    units: L.units,
    reasoning: L.analysis || L.reasoning,
    form: L.form,
    supporting: L.why,
    type: "ml",
    allowNoOdds: true,
    forced: !!L.forced
  };
  const std = standardizePick(asPick, { lotd: true });
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
    .setDescription((std.finalLine || formatStandardDiscord(std)).slice(0, 4000))
    .setFooter({ text: `${L.date || ""} · EDGE PLAY · force daily leans labeled · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard || { picks: [] };
  const e = new EmbedBuilder()
    .setColor(colors?.gold || 0xc4a35a)
    .setTitle("📡 LIVE CARD · EVIDENCE ENGINE")
    .setDescription(`**${c.dateLabel || "TODAY"}**\nEngine output: 🟢 STRONG · 🟡 LEAN · 🔴 NO PLAY`)
    .setFooter({ text: "EDGE PLAY · multi-factor · force daily leans labeled · 21+" })
    .setTimestamp();
  const picks = (c.picks || []).filter((p) =>
    ["LOCK", "CAP", "VALUE", "LEAN", "STRONG"].includes((p.tier || "").toUpperCase())
  );
  if (!picks.length) {
    e.setDescription("🔴 NO PLAY board yet.\nREASON: Empty desk or insufficient evidence. Never invent locks. Run `/daily`.");
    return e;
  }
  for (const p of picks.slice(0, 8)) {
    const std = standardizePick({ ...p, allowNoOdds: true });
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
    .setFooter({ text: "EDGE PLAY · clear FINAL · force daily with analysis · 21+" });
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
      type: "ml",
      allowNoOdds: true,
      forced: !!lockOfTheDay.forced
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
    const std = standardizePick({ ...p, allowNoOdds: true });
    e.addFields({
      name: `${std.playEmoji || "🔒"} ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std).slice(0, 1020),
      inline: false
    });
  }
  for (const p of values.slice(0, 5)) {
    const std = standardizePick({ ...p, allowNoOdds: true });
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
