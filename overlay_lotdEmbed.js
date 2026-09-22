import { EmbedBuilder } from "discord.js";
import { lockOfTheDay, liveCard, premiumAlerts } from "./data/desk.js";
import { config } from "./config.js";

const { colors } = config;

function analysisBlock(r, why) {
  if (!r || typeof r !== "object") {
    return why ? `_${why}_` : "_Run `/daily` for full analysis._";
  }
  return [
    `**Form:** ${r.form || "—"}`,
    `**Spot:** ${r.situational || r.serve || "—"}`,
    `**Number:** ${r.number || "—"}`,
    `**Media:** ${r.media || "Check /media — desk sizes units"}`,
    `**Facts:** ${r.facts || "Board data when available"}`,
    `**Projection:** ${r.projection || "Process lean — not guaranteed"}`,
    `**Missing:** ${r.missing || "Injuries / close may move"}`,
    `**Both sides:** ${r.bothSides || "Wrong number = PASS"}`,
    `**Confidence:** ${r.confidenceLine || r.confidence || "MEDIUM"}`,
    `**Kill:** ${r.kill || "—"}`,
    `**Call:** ${r.decision || r.prediction || why || "—"}`
  ].join("\n");
}

export function lotdEmbed() {
  const L = lockOfTheDay || {};
  const a = L.analysis || {};
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("👑 LOCK OF THE DAY · FULL ANALYSIS")
    .setDescription(
      `**${L.pick || "Run /daily"}**\n` +
        `${L.event || ""} · ${L.match || ""}\n` +
        `**Market:** ${L.market || "—"}\n` +
        `**Price:** ${L.priceGuide || "—"}\n` +
        `**Size:** **${L.units ?? "—"}u** · **${L.tier || "LOCK OF THE DAY"}**\n\n` +
        `### Form\n${a.form || "—"}\n\n` +
        `### Spot / Situation\n${a.situational || a.serve || "—"}\n\n` +
        `### Number\n${a.number || L.priceGuide || "—"}\n\n` +
        `### Media\n${a.media || "IG / X / TG = signal only. Desk sizes the bet — /media"}\n\n` +
        `### Facts\n${a.facts || "Board data when available"}\n\n` +
        `### Projection\n${a.projection || "Process lean — not guaranteed"}\n\n` +
        `### Missing data\n${a.missing || "Injuries / closing line"}\n\n` +
        `### Both sides\n${a.bothSides || "Wrong number = PASS"}\n\n` +
        `### Confidence\n${a.confidenceLine || a.confidence || "MEDIUM"}\n\n` +
        `### What kills it\n${a.kill || "—"}\n\n` +
        `### Call\n**${a.prediction || a.decision || "—"}**`
    )
    .setFooter({ text: `${L.date || ""} · EDGE PLAY · evidence-based · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard || { picks: [] };
  const e = new EmbedBuilder()
    .setColor(colors?.gold || 0xc4a35a)
    .setTitle("📡 LIVE CARD · TAKES + ANALYSIS")
    .setDescription(`**${c.dateLabel || "TODAY"}**\n✅ TAKE · 💎 VALUE · ➖ LEAN · ⏸️ HOLD · 🚫 PASS`)
    .setFooter({ text: "EDGE PLAY · full analysis · 21+" })
    .setTimestamp();
  for (const p of (c.picks || []).slice(0, 10)) {
    const take =
      p.tier === "LOCK" || p.tier === "CAP"
        ? `✅ **TAKE · LOCK** ${p.selection}`
        : p.tier === "VALUE"
          ? `💎 **VALUE · TAKE** ${p.selection}`
          : p.tier === "LEAN"
            ? `➖ **LEAN · TAKE** ${p.selection}`
            : p.tier === "HOLD"
              ? `⏸️ **HOLD** ${p.selection}`
              : `🚫 **PASS**`;
    e.addFields({
      name: `${p.tier} · ${p.sport}`.slice(0, 256),
      value: (`${take}\n**${p.game}**\nPrice: ${p.price} · **${p.units}u**\n` + analysisBlock(p.reasoning, p.why)).slice(0, 1020),
      inline: false
    });
  }
  if (!(c.picks || []).length) e.setDescription("No picks — run `/daily`.");
  return e;
}

export function locksTodayEmbed() {
  const locks = (liveCard?.picks || []).filter((p) => p.tier === "LOCK" || p.tier === "CAP" || p.potd);
  const leans = (liveCard?.picks || []).filter((p) => p.tier === "LEAN" || p.tier === "VALUE").slice(0, 6);
  const e = new EmbedBuilder().setColor(0xf4d03f).setTitle("🔒 LOCKS · FULL ANALYSIS").setTimestamp().setFooter({ text: "EDGE PLAY · analysis · 21+" });
  if (lockOfTheDay?.pick) {
    const a = lockOfTheDay.analysis || {};
    e.addFields({
      name: `👑 ${lockOfTheDay.tier || "LOCK OF THE DAY"}`,
      value: (`✅ **${lockOfTheDay.pick}**\n${lockOfTheDay.match || ""}\n**Price:** ${lockOfTheDay.priceGuide} · **${lockOfTheDay.units}u**\n` + analysisBlock(a, lockOfTheDay.pick)).slice(0, 1020),
      inline: false
    });
  }
  for (const p of locks.slice(0, 5)) {
    e.addFields({
      name: `🔒 ${p.sport} · ${p.selection}`.slice(0, 256),
      value: (`✅ **TAKE** · ${p.price} · **${p.units}u**\n**${p.game}**\n` + analysisBlock(p.reasoning, p.why)).slice(0, 1020),
      inline: false
    });
  }
  for (const p of leans) {
    e.addFields({
      name: `➖ ${p.tier} · ${p.sport}`.slice(0, 256),
      value: (`**${p.selection}** · ${p.price} · **${p.units}u**\n**${p.game}**\n` + analysisBlock(p.reasoning, p.why)).slice(0, 1020),
      inline: false
    });
  }
  if (!locks.length && !leans.length && !lockOfTheDay?.pick) e.setDescription("Run `/daily` — forces LOCK OF THE DAY + analysis.");
  return e;
}

export function valueBoardEmbed() {
  const values = (liveCard?.picks || []).filter((p) => p.tier === "VALUE");
  const rows = liveCard?.valueBoard || [];
  const e = new EmbedBuilder().setColor(0x3498db).setTitle("💎 VALUE · ANALYSIS").setFooter({ text: "VALUE 0.35–0.5u · 21+" }).setTimestamp();
  for (const p of values.slice(0, 6)) {
    e.addFields({
      name: `💎 ${p.sport}`,
      value: (`✅ **TAKE ${p.selection}**\n**${p.game}**\n${p.price} · **${p.units}u**\n` + analysisBlock(p.reasoning, p.why)).slice(0, 1020),
      inline: false
    });
  }
  for (const r of rows.slice(0, 4)) {
    e.addFields({ name: `💎 ${r.sport}`, value: `**${r.pick}**\n${r.price} · **${r.units}u**\n_${r.why}_`, inline: false });
  }
  if (!values.length && !rows.length) e.setDescription("Run `/daily` for VALUE + analysis.");
  return e;
}

export function propsEmbed() {
  const rows = liveCard?.playerPicks || [];
  const e = new EmbedBuilder().setColor(0x9b59b6).setTitle("👤 PLAYER PROPS · ANALYSIS").setFooter({ text: "props · 21+" }).setTimestamp();
  for (const x of rows) {
    const icon = x.tier === "LOCK" || x.tier === "VALUE" ? "✅ TAKE" : x.tier === "LEAN" ? "➖ SMALL" : x.tier === "HOLD" ? "⏸️ HOLD" : "🚫 PASS";
    e.addFields({ name: `${icon} · ${x.sport} · ${x.player}`, value: `**${x.market}** — ${x.side}\n**${x.tier}** · **${x.units}u**\n**Analysis:** ${x.note}`, inline: false });
  }
  if (!rows.length) e.setDescription("No props — run `/daily`.");
  return e;
}

export function parlaysEmbed() {
  const rows = liveCard?.parlays || [];
  const e = new EmbedBuilder().setColor(0xe67e22).setTitle("🔗 PARLAYS · ANALYSIS").setDescription("Max 2 legs LEAN+. Lotto = PASS.").setFooter({ text: "parlays · 21+" }).setTimestamp();
  for (const p of rows) {
    const icon = p.tier === "VALUE" || p.tier === "LEAN" ? "✅ BUILD" : p.tier === "HOLD" ? "⏸️ WAIT" : "🚫 SKIP";
    e.addFields({ name: `${icon} · ${p.name}`, value: `Legs:\n${(p.legs || []).map((l) => `• ${l}`).join("\n")}\n**${p.tier}** · **${p.units}u**\n**Analysis:** ${p.note}`, inline: false });
  }
  if (!rows.length) e.setDescription("Use two LEANs from `/live` max.");
  return e;
}
