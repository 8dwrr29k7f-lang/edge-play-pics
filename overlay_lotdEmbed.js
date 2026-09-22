import { EmbedBuilder } from "discord.js";
import { lockOfTheDay, liveCard, premiumAlerts } from "./data/desk.js";
import { config } from "./config.js";

const { colors } = config;

export function lotdEmbed() {
  const L = lockOfTheDay;
  const a = L.analysis || {};
  return new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("👑 PLAY OF THE DAY · LET'S EAT")
    .setDescription(
      `**${L.pick}**\n` +
        `${L.event} · ${L.match}\n` +
        `**Market:** ${L.market}\n` +
        `**Price guide:** ${L.priceGuide}\n` +
        `**Size:** **${L.units}u** · **${L.tier}**\n\n` +
        `### Form\n${a.form || "—"}\n\n` +
        `### Serve\n${a.serve || "—"}\n\n` +
        `### Situational\n${a.situational || "—"}\n\n` +
        `### What breaks this\n${a.kill || "—"}\n\n` +
        `### Prediction\n**${a.prediction || "—"}**\n\n` +
        `📡 Kalshi: ${L.kalshi || ""}`
    )
    .setFooter({ text: `${L.date} · EDGE PLAY PICS · 21+` })
    .setTimestamp();
}

export function liveCardEmbed() {
  const c = liveCard;
  const e = new EmbedBuilder()
    .setColor(colors.gold)
    .setTitle("📡 LIVE CARD · WHO WE'RE ON")
    .setDescription(`**${c.dateLabel}**\nNamed takes + analysis.`)
    .setFooter({ text: "EDGE PLAY · clear TAKE / PASS · 21+" })
    .setTimestamp();

  for (const p of (c.picks || []).slice(0, 12)) {
    const icon = p.tier === "LOCK" ? "🔒" : p.tier === "LEAN" ? "➖" : p.tier === "HOLD" ? "⏸️" : "🚫";
    const r = p.reasoning;
    const thought = r
      ? `\n**Analysis**\n• Form: ${r.form}\n• Spot: ${r.situational}\n• Number: ${r.number}\n• Kill: ${r.kill}\n• **${r.decision}**`
      : `\n_${p.why}_`;
    e.addFields({
      name: `${icon} ${p.tier} · ${p.sport}`,
      value: `**${p.selection}**\n**${p.game}**\nPrice: ${p.price} · **${p.units}u**${thought}`.slice(0, 1020),
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
    .setTitle("🔒 LOCKS & LOCKABLE PICKS")
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY · full analysis · 21+" });

  if (lockOfTheDay?.pick) {
    const a = lockOfTheDay.analysis || {};
    e.addFields({
      name: `👑 ${lockOfTheDay.tier || "PLAY OF THE DAY"}`,
      value: (`✅ **${lockOfTheDay.pick}**\n${lockOfTheDay.match || ""}\n**Price:** ${lockOfTheDay.priceGuide} · **${lockOfTheDay.units}u**\n\n**Form:** ${a.form || "—"}\n**Spot:** ${a.situational || a.serve || "—"}\n**Kill:** ${a.kill || "—"}\n**Call:** ${a.prediction || "—"}`).slice(0, 1020),
      inline: false
    });
  }

  for (const p of locks.slice(0, 5)) {
    const r = p.reasoning || {};
    e.addFields({
      name: `🔒 ${p.tier} · ${p.sport}`,
      value: (`✅ **TAKE ${p.selection}**\n**${p.game}**\nPrice: ${p.price} · **${p.units}u**\n` + (r.form ? `**Form:** ${r.form}\n**Spot:** ${r.situational || "—"}\n**Number:** ${r.number || "—"}\n**Kill:** ${r.kill || "—"}\n**Decision:** ${r.decision || p.why}` : `_${p.why}_`)).slice(0, 1020),
      inline: false
    });
  }

  if (leans.length) {
    e.addFields({ name: "➖ LOCKABLE IF PRICE HITS", value: "Promote to LOCK only inside the number band.", inline: false });
    for (const p of leans) {
      const r = p.reasoning || {};
      e.addFields({
        name: `➖ ${p.sport} · ${p.selection}`.slice(0, 256),
        value: (`**${p.game}**\nPrice gate: ${p.price} · **${p.units}u**\n` + (r.form ? `**Form:** ${r.form}\n**Spot:** ${r.situational || "—"}\n**Number:** ${r.number || "—"}\n**Kill:** ${r.kill || "—"}\n**Decision:** ${r.decision || p.why}` : `_${p.why}_`)).slice(0, 1020),
        inline: false
      });
    }
  }

  if (!locks.length && !leans.length && !lockOfTheDay?.pick) {
    e.setDescription("**No lockable board yet.** Run `/daily` to build today's ESPN card.");
  } else if (!locks.length) {
    e.setDescription("**No full LOCK yet** — lockable leans below with analysis. Size LEAN until number earns LOCK.");
  }
  return e;
}
