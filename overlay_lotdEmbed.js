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
    selection: (L.pick || "").replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim() || L.pick,
    game: L.match || L.event,
    sport: L.sport,
    tier: "LOCK",
    price: L.priceGuide,
    units: L.units,
    reasoning: L.analysis,
    type: "ml"
  };
  const std = standardizePick(asPick, { lotd: true });
  const body = formatStandardDiscord(std);
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("👑 LOCK OF THE DAY · STANDARD CARD")
    .setDescription(body.slice(0, 4000))
    .setFooter({ text: `${L.date || ""} · EDGE PLAY · facts ≠ guarantee · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard || { picks: [] };
  const e = new EmbedBuilder()
    .setColor(colors?.gold || 0xc4a35a)
    .setTitle("📡 LIVE CARD · STANDARD TAKES")
    .setDescription(`**${c.dateLabel || "TODAY"}**\nPICK · CONF · ODDS · EDGE · RISK · VERDICT`)
    .setFooter({ text: "EDGE PLAY · standardized · not guaranteed · 21+" })
    .setTimestamp();
  const picks = (c.picks || []).filter((p) =>
    ["LOCK", "CAP", "VALUE", "LEAN"].includes((p.tier || "").toUpperCase())
  );
  if (!picks.length) {
    e.setDescription("🚫 NO PICK board yet.\nREASON: Run `/daily`. Never invent locks.");
    return e;
  }
  for (const p of picks.slice(0, 8)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${p.tier} · ${p.sport}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export function locksTodayEmbed() {
  const e = new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("🔒 LOCKS · STANDARD CARDS")
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY · clear FINAL PICK · 21+" });
  if (lockOfTheDay?.pick) {
    const asPick = {
      selection: String(lockOfTheDay.pick).replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim(),
      game: lockOfTheDay.match || lockOfTheDay.event,
      sport: lockOfTheDay.sport,
      tier: "LOCK",
      price: lockOfTheDay.priceGuide,
      units: lockOfTheDay.units,
      reasoning: lockOfTheDay.analysis,
      type: "ml"
    };
    const std = standardizePick(asPick, { lotd: true });
    e.addFields({
      name: "👑 LOCK OF THE DAY",
      value: formatStandardDiscord(std).slice(0, 1020),
      inline: false
    });
  }
  const locks = (liveCard?.picks || []).filter((p) => p.tier === "LOCK" || p.tier === "CAP" || p.potd);
  const values = (liveCard?.picks || []).filter((p) => p.tier === "VALUE" || p.tier === "LEAN");
  for (const p of locks.slice(0, 4)) {
    const std = standardizePick(p);
    e.addFields({
      name: `🔒 ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std).slice(0, 1020),
      inline: false
    });
  }
  for (const p of values.slice(0, 5)) {
    const std = standardizePick(p);
    e.addFields({
      name: `${p.tier} · ${p.sport} · ${p.selection}`.slice(0, 256),
      value: formatStandardDiscord(std, { compact: true }).slice(0, 1020),
      inline: false
    });
  }
  if (!lockOfTheDay?.pick && !locks.length && !values.length) {
    e.setDescription("🚫 FINAL PICK: NO PICK\nREASON: Empty desk — run `/daily`.");
  }
  return e;
}

export function valueBoardEmbed() {
  const values = (liveCard?.picks || []).filter((p) => p.tier === "VALUE");
  const e = new EmbedBuilder().setColor(0x3498db).setTitle("💎 VALUE · STANDARD CARDS").setFooter({ text: "VALUE · 21+" }).setTimestamp();
  if (!values.length) {
    e.setDescription("🚫 NO PICK — run `/daily`.");
    return e;
  }
  for (const p of values.slice(0, 6)) {
    const std = standardizePick(p);
    e.addFields({
      name: `💎 ${p.sport} · ${p.selection}`.slice(0, 256),
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
    e.setDescription("🚫 FINAL PICK: NO PICK\nREASON: No prop board with usage + number.");
    return e;
  }
  for (const x of rows) {
    const take =
      x.tier === "LOCK" || x.tier === "VALUE"
        ? `🏆 PICK: ${x.player} · ${x.market} · ${x.side}`
        : x.tier === "LEAN"
          ? `🏆 PICK (LEAN): ${x.player} · ${x.side}`
          : `🚫 NO PICK · ${x.player}`;
    e.addFields({
      name: `${x.tier} · ${x.sport}`.slice(0, 256),
      value: `${take}\n**${x.units}u** · ${x.note || "Need usage + number"}`.slice(0, 1020),
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
    .setDescription("Each leg analyzed alone first. Combined probability compounds risk.")
    .setFooter({ text: "parlays · 21+" })
    .setTimestamp();
  const legs = (liveCard?.picks || [])
    .filter((p) => ["LEAN", "VALUE", "LOCK"].includes(p.tier) && !p.final)
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
    e.setDescription("🚫 NO PICK parlay — need two LEAN+ legs from `/live`.");
  }
  return e;
}
