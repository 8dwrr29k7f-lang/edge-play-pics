/**
 * Per-sport category embeds — always one clear LOCK when games exist
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { categories, liveCard, lockOfTheDay } from "./data/desk.js";
import { standardizePick } from "./pickFormat.js";

const { colors } = config;

function pickForCategory(key) {
  const sport = (key || "").toUpperCase();
  const all = liveCard?.picks || [];
  const list = all.filter(
    (p) =>
      (p.sport || "").toUpperCase() === sport &&
      !p.final &&
      !/Postponed| — OFF| — FINAL/i.test(p.game || "")
  );
  const lock =
    list.find((p) => p.tier === "LOCK" || p.potd) ||
    list.find((p) => p.tier === "VALUE") ||
    list.find((p) => p.tier === "LEAN");
  return { lock, list, sport };
}

function formatLockCard(p, sport) {
  if (!p) {
    return (
      "🔒 **LOCK**\n" +
      "Pick: _no named games on board for this category_\n" +
      "Market: —\nLine/Odds: —\nConfidence: n/a\n\n" +
      "Why:\n• Slate empty or finished for this sport\n\n" +
      "Risk:\nRun `/daily` when games post. Never invent a lock."
    );
  }
  let confPct = 55;
  try {
    const std = standardizePick(p);
    confPct = std.confidencePct ?? 55;
  } catch {}
  const confLabel = p.confidenceLabel || "MEDIUM";
  const conf =
    confLabel === "LOW CONFIDENCE"
      ? confPct + "% · **LOW CONFIDENCE** (strongest available — not high certainty)"
      : confPct + "% · " + confLabel;
  const why = [];
  const r = p.reasoning || {};
  if (r.form) why.push(r.form);
  if (r.situational) why.push(r.situational);
  if (r.number) why.push(r.number);
  if (r.decision) why.push(r.decision);
  while (why.length < 3) {
    why.push(
      why.length === 0
        ? "Named ESPN game: " + p.game
        : why.length === 1
          ? "Category strongest available side for " + sport
          : "Size " + p.units + "u only inside process band"
    );
  }
  const risk = r.kill || r.stressFail || "Injury · line move · missing starter";
  return (
    "🔒 **LOCK**\n" +
    "**Pick:** " + p.selection + "\n" +
    "**Sport/Game:** " + sport + " · " + p.game + "\n" +
    "**Market:** Moneyline\n" +
    "**Line/Odds:** " + (p.price || "—") + "\n" +
    "**Confidence:** " + conf + "\n\n" +
    "**Why:**\n" +
    why.slice(0, 5).map((x) => "• " + x).join("\n") +
    "\n\n**Risk:**\n" + risk
  );
}

export function categoryEmbed(key) {
  const cat = categories[key] || categories[key?.toLowerCase?.()];
  const label = cat?.label || (key || "").toUpperCase();
  const emoji = cat?.emoji || "📊";
  const { lock, list, sport } = pickForCategory(key);

  const e = new EmbedBuilder()
    .setColor(colors?.lock || 0xf1c40f)
    .setTitle(emoji + " " + label + " · CATEGORY LOCK")
    .setDescription(formatLockCard(lock, sport).slice(0, 4000))
    .setFooter({ text: "EDGE PLAY · category strongest available · not guaranteed · 21+" })
    .setTimestamp();

  for (const p of list.filter((x) => x !== lock).slice(0, 4)) {
    e.addFields({
      name: (p.tier + " · " + p.selection).slice(0, 256),
      value: (p.game + "\n" + p.price + " · **" + p.units + "u**").slice(0, 1020),
      inline: false
    });
  }
  if (cat?.mediaOverall) {
    e.addFields({ name: "Media overall", value: String(cat.mediaOverall).slice(0, 1020), inline: false });
  }
  return e;
}

export function bestOverallEmbed() {
  const lotd = lockOfTheDay;
  const e = new EmbedBuilder()
    .setColor(0xf4d03f)
    .setTitle("⭐ BEST OVERALL · LOCK OF THE DAY")
    .setTimestamp()
    .setFooter({ text: "EDGE PLAY · 21+" });
  if (lotd?.pick) {
    const asPick = {
      selection: String(lotd.pick).replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim(),
      game: lotd.match || lotd.event,
      sport: lotd.sport,
      tier: "LOCK",
      price: lotd.priceGuide,
      units: lotd.units,
      reasoning: lotd.analysis,
      type: "ml"
    };
    e.setDescription(formatLockCard(asPick, lotd.sport || "DESK").slice(0, 4000));
  } else {
    e.setDescription("🔒 **LOCK**\nPick: run `/daily` to roll ESPN slate\n\nRisk: No card until daily roll.");
  }
  return e;
}

export function allLocksEmbed() {
  const e = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🔒 CLEAR LOCKS · ALL CATEGORIES")
    .setTimestamp()
    .setFooter({ text: "One LOCK per sport when games exist · 21+" });
  let any = false;
  for (const s of ["MLB", "NFL", "NBA", "TENNIS", "KBO", "SOCCER"]) {
    const { lock } = pickForCategory(s);
    if (lock) {
      any = true;
      e.addFields({
        name: ("🔒 " + s + " · " + lock.selection).slice(0, 256),
        value: formatLockCard(lock, s).slice(0, 1020),
        inline: false
      });
    }
  }
  if (!any) {
    e.setDescription("No category locks yet — run **`/daily`** to build named ESPN takes.");
  }
  return e;
}

export function mediaAllEmbed() {
  const e = new EmbedBuilder()
    .setColor(colors?.gold || 0xc4a35a)
    .setTitle("📡 MEDIA · ALL SPORTS")
    .setDescription("Media = public signal only. Desk sizes units via process.")
    .setTimestamp();
  for (const [k, c] of Object.entries(categories || {})) {
    e.addFields({
      name: (c.emoji || "•") + " " + (c.label || k),
      value: (c.mediaOverall || "—").slice(0, 1020),
      inline: false
    });
  }
  return e;
}
