import { EmbedBuilder } from "discord.js";
import { lockOfTheDay, liveCard, premiumAlerts } from "./data/desk.js";
import { config } from "./config.js";

const { colors } = config;

export function lotdEmbed() {
  const L = lockOfTheDay;
  const a = L.analysis || {};
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("👑 PLAY OF THE DAY")
    .setDescription(
      `**${L.pick}**\n${L.event} · ${L.match}\n**Market:** ${L.market}\n**Price:** ${L.priceGuide}\n**Size:** **${L.units}u** · **${L.tier}**\n\n### Form\n${a.form || "—"}\n\n### Spot\n${a.situational || a.serve || "—"}\n\n### Kill\n${a.kill || "—"}\n\n### Call\n**${a.prediction || "—"}**`
    )
    .setFooter({ text: `${L.date || ""} · EDGE PLAY · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard;
  const e = new EmbedBuilder()
    .setColor(colors.gold || 0xc4a35a)
    .setTitle("📡 LIVE CARD · CLEAR INDICATION")
    .setDescription(`**${c.dateLabel || "TODAY"}**\n✅ TAKE · 💎 VALUE · ➖ LEAN · ⏸️ HOLD · 🚫 PASS`)
    .setFooter({ text: "EDGE PLAY · 21+" })
    .setTimestamp();
  for (const p of (c.picks || []).slice(0, 12)) {
    const take =
      p.tier === "LOCK" || p.tier === "CAP"
        ? `✅ **TAKE · LOCK** ${p.selection}`
        : p.tier === "VALUE"
          ? `💎 **VALUE · TAKE** ${p.selection}`
          : p.tier === "LEAN"
            ? `➖ **LEAN · SMALL** ${p.selection}`
            : p.tier === "HOLD"
              ? `⏸️ **HOLD · NO TICKET YET** ${p.selection}`
              : `🚫 **PASS · DO NOT BET**`;
    const r = p.reasoning;
    const thought = r
      ? `\n**Analysis**\n• Form: ${r.form}\n• Spot: ${r.situational}\n• Number: ${r.number}\n• Kill: ${r.kill}\n• **${r.decision}**`
      : `\n_${p.why || ""}_`;
    e.addFields({
      name: `${p.tier} · ${p.sport}`,
      value: `${take}\n**${p.game}**\nPrice: ${p.price} · **${p.units}u**${thought}`.slice(0, 1020),
      inline: false
    });
  }
  return e;
}

export function locksTodayEmbed() {
  const locks = (liveCard.picks || []).filter((p) => p.tier === "LOCK" || p.tier === "CAP");
  const leans = (liveCard.picks || []).filter((p) => p.tier === "LEAN" || p.potd).slice(0, 6);
  const e = new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("🔒 LOCKS & LOCKABLE")
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY · analysis · 21+" });
  if (lockOfTheDay?.pick) {
    const a = lockOfTheDay.analysis || {};
    e.addFields({
      name: `👑 ${lockOfTheDay.tier || "PLAY OF THE DAY"}`,
      value: (`✅ **${lockOfTheDay.pick}**\n**Form:** ${a.form || "—"}\n**Spot:** ${a.situational || "—"}\n**Kill:** ${a.kill || "—"}\n**Call:** ${a.prediction || "—"}\nPrice: ${lockOfTheDay.priceGuide} · **${lockOfTheDay.units}u**`).slice(0, 1020),
      inline: false
    });
  }
  for (const p of locks.slice(0, 5)) {
    e.addFields({ name: `🔒 ${p.sport}`, value: `✅ **TAKE ${p.selection}**\n**${p.game}**\n${p.price} · **${p.units}u**\n_${p.why}_`.slice(0, 1020), inline: false });
  }
  for (const p of leans) {
    const r = p.reasoning || {};
    e.addFields({
      name: `➖ LOCKABLE · ${p.sport}`,
      value: (`**${p.selection}**\n**${p.game}**\nGate: ${p.price} · **${p.units}u**\n**Form:** ${r.form || p.why}\n**Kill:** ${r.kill || "—"}\n**${r.decision || "LEAN"}**`).slice(0, 1020),
      inline: false
    });
  }
  if (!locks.length && !leans.length) e.setDescription("Run `/daily` to build lockable board.");
  return e;
}

export function valueBoardEmbed() {
  const rows = liveCard.valueBoard || [];
  const values = (liveCard.picks || []).filter((p) => p.tier === "VALUE");
  const e = new EmbedBuilder().setColor(0x3498db).setTitle("💎 VALUE PICKS · CLEAR TAKE").setFooter({ text: "VALUE 0.35–0.5u · 21+" }).setTimestamp();
  for (const p of values.slice(0, 6)) {
    e.addFields({ name: `💎 VALUE · ${p.sport}`, value: `✅ **TAKE ${p.selection}**\n**${p.game}**\n${p.price} · **${p.units}u**\n_${p.why}_`, inline: false });
  }
  for (const r of rows.slice(0, 5)) {
    e.addFields({ name: `💎 ${r.sport}`, value: `**${r.pick}**\n${r.price} · **${r.units}u**\n_${r.why}_`, inline: false });
  }
  if (!values.length && !rows.length) e.setDescription("No VALUE rows — run `/daily`.");
  return e;
}

export function propsEmbed() {
  const rows = liveCard.playerPicks || [];
  const e = new EmbedBuilder().setColor(0x9b59b6).setTitle("👤 PLAYER PROPS · CLEAR INDICATION").setFooter({ text: "props · 21+" }).setTimestamp();
  for (const x of rows) {
    const icon = x.tier === "LOCK" || x.tier === "VALUE" ? "✅ TAKE" : x.tier === "LEAN" ? "➖ SMALL" : x.tier === "HOLD" ? "⏸️ HOLD" : "🚫 PASS";
    e.addFields({ name: `${icon} · ${x.sport} · ${x.player}`, value: `**${x.market}** — ${x.side}\n**${x.tier}** · **${x.units}u**\n_${x.note}_`, inline: false });
  }
  if (!rows.length) e.setDescription("No props — run `/daily`.");
  return e;
}

export function parlaysEmbed() {
  const rows = liveCard.parlays || [];
  const e = new EmbedBuilder().setColor(0xe67e22).setTitle("🔗 PARLAYS · CLEAR INDICATION").setDescription("Max 2 legs LEAN+. Lotto = PASS for bankroll.").setFooter({ text: "parlays · 21+" }).setTimestamp();
  for (const p of rows) {
    const icon = p.tier === "VALUE" || p.tier === "LEAN" ? "✅ BUILD" : p.tier === "HOLD" ? "⏸️ WAIT" : "🚫 SKIP";
    e.addFields({ name: `${icon} · ${p.name}`, value: `Legs:\n${(p.legs || []).map((l) => `• ${l}`).join("\n")}\n**${p.tier}** · **${p.units}u**\n_${p.note}_`, inline: false });
  }
  if (!rows.length) e.setDescription("Use two LEANs from `/live` max.");
  return e;
}
