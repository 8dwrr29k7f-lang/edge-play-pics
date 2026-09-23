import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
  EmbedBuilder
} from "discord.js";
import http from "http";
import cron from "node-cron";
import { config, assertConfig } from "./config.js";
import { wireEmbed, limitsEmbed, scoresEmbed, helpEmbed, kalshiEmbed } from "./embeds.js";
import { fetchMlbScores } from "./scores.js";
import {
  categoryEmbed,
  bestOverallEmbed
} from "./categoryEmbed.js";
import { lotdEmbed, liveCardEmbed, locksTodayEmbed } from "./lotdEmbed.js";
import { hedgesEmbed } from "./cashout.js";
import { leanEmbed, holdEmbed, mediaFollowEmbed } from "./mediaFollow.js";
import {
  morningBundle,
  eveningBundle,
  runChangeAnnounce,
  initSnapshotIfEmpty
} from "./announce.js";
import { learnEmbed, enhanceReviewEmbed } from "./trackerLearn.js";
import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";
import { getCurrentBoard, getTrackerSummary, reverifyPicks } from "./dailyEngine.js";
import { registerCommandsOnBoot } from "./registerOnBoot.js";
import {
  logPick,
  gradePick,
  trackerSummaryEmbed,
  trackerPendingEmbed
} from "./tracker.js";
import { refreshData } from "./liveApi.js";
import { runHealthCheck } from "./health.js";

assertConfig();

const PORT = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("EDGE PLAY PICS · alive\n");
  })
  .listen(PORT, () => console.log(`Health listener on :${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

let schedulerArmed = false;
let discordReady = false;

async function postToPics(payload) {
  const chId = config.picsChannelId;
  if (!chId) {
    console.warn("[postToPics] PICS_CHANNEL_ID not set — skip");
    return;
  }
  try {
    const ch = await client.channels.fetch(chId);
    if (!ch || !ch.isTextBased()) {
      console.warn("[postToPics] channel missing or not text");
      return;
    }
    if (Array.isArray(payload)) {
      for (const p of payload) {
        await ch.send(p).catch((e) => console.warn("[postToPics]", e.message));
      }
    } else {
      await ch.send(payload).catch((e) => console.warn("[postToPics]", e.message));
    }
  } catch (e) {
    console.warn("[postToPics]", e.message);
  }
}

const SPORT_KEYS = new Set([
  "kbo", "npb", "tennis", "soccer", "mma", "boxing", "mlb", "nfl", "nba", "esports", "kalshi"
]);

client.once(Events.ClientReady, async (c) => {
  discordReady = true;
  console.log(`[boot] Logged in as ${c.user.tag}`);
  try {
    await registerCommandsOnBoot();
  } catch (e) {
    console.warn("[boot] registerCommandsOnBoot:", e.message);
  }
  client.user.setActivity("EDGE PLAY · daily engine", { type: ActivityType.Watching });

  initSnapshotIfEmpty();

  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("[cron] 08:00 DAILY SCAN");
      try {
        const embeds = await morningBundle();
        await postToPics(embeds);
      } catch (e) {
        console.error("[cron] morningBundle:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 12 * * *",
    async () => {
      console.log("[cron] 12:00 MONITOR");
      try {
        const alerts = await runChangeAnnounce();
        if (alerts.length) await postToPics(alerts);
      } catch (e) {
        console.error("[cron] midday:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 16 * * *",
    async () => {
      console.log("[cron] 16:00 MONITOR");
      try {
        await reverifyPicks();
        const alerts = await runChangeAnnounce();
        if (alerts.length) await postToPics(alerts);
      } catch (e) {
        console.error("[cron] 16:00:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[cron] 20:00 EVENING");
      try {
        const embeds = await eveningBundle();
        await postToPics(embeds);
      } catch (e) {
        console.error("[cron] evening:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  const mins = config.scanMinutes || 15;
  setInterval(async () => {
    try {
      await reverifyPicks();
    } catch (e) {
      console.warn("[interval] reverify:", e.message);
    }
  }, mins * 60 * 1000);

  schedulerArmed = true;
  console.log(`[boot] scheduler armed · reverify every ${mins}m`);

  setTimeout(async () => {
    try {
      console.log("[boot] initial scan...");
      await ensureTodayCard();
      console.log("[boot] board ready");
    } catch (e) {
      console.warn("[boot] scan:", e.message);
    }
    try {
      const h = await runHealthCheck({ discordReady, schedulerArmed });
      console.log("[boot] health:\n" + h.lines.join("\n"));
    } catch (e) {
      console.warn("[boot] health:", e.message);
    }
  }, 5000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;
  try {
    if (name === "help") {
      await interaction.reply({ embeds: [helpEmbed()] });
      return;
    }

    if (name === "daily" || name === "card" || name === "roll") {
      await interaction.deferReply();
      const board = await ensureTodayCard();
      const e = new EmbedBuilder()
        .setColor(board?.emptyBoard ? 0x95a5a6 : 0x2ecc71)
        .setTitle(board?.emptyBoard ? "📡 BOARD · WAITING FOR GAMES" : "📡 DAILY BOARD")
        .setDescription((board?.text || "No board.").slice(0, 4000))
        .setFooter({ text: "EDGE PLAY · best available play · 21+" })
        .setTimestamp();
      await interaction.editReply({ embeds: [e] });
      return;
    }

    if (name === "scan") {
      await interaction.deferReply();
      const board = await rollDailyCard({ force: true });
      const e = new EmbedBuilder()
        .setColor(board?.emptyBoard ? 0x95a5a6 : 0x2ecc71)
        .setTitle("🔬 FORCED SCAN COMPLETE")
        .setDescription((board?.text || "Done.").slice(0, 4000))
        .setTimestamp();
      await interaction.editReply({ embeds: [e] });
      return;
    }

    if (name === "locks" || name === "lock") {
      await interaction.reply({ embeds: [locksTodayEmbed()] });
      return;
    }
    if (name === "lotd") {
      await interaction.reply({ embeds: [lotdEmbed()] });
      return;
    }
    if (name === "best") {
      await interaction.reply({ embeds: [bestOverallEmbed()] });
      return;
    }
    if (name === "live" || name === "picks" || name === "all") {
      await interaction.reply({ embeds: [liveCardEmbed()] });
      return;
    }
    if (name === "pics" || name === "wire") {
      await interaction.reply({ embeds: [wireEmbed()] });
      return;
    }

    if (name === "lean") {
      await interaction.reply({ embeds: [leanEmbed()] });
      return;
    }
    if (name === "hold") {
      await interaction.reply({ embeds: [holdEmbed()] });
      return;
    }
    if (name === "follow" || name === "media") {
      await interaction.deferReply();
      const emb = await mediaFollowEmbed();
      await interaction.editReply({ embeds: [emb] });
      return;
    }

    if (name === "hedge" || name === "cashout") {
      await interaction.reply({ embeds: [hedgesEmbed()] });
      return;
    }

    if (name === "limits") {
      await interaction.reply({ embeds: [limitsEmbed()] });
      return;
    }
    if (name === "scores") {
      await interaction.deferReply();
      try {
        const { lines, status } = await fetchMlbScores();
        await interaction.editReply({ embeds: [scoresEmbed(lines || [], status)] });
      } catch (e) {
        await interaction.editReply({
          content: "Scores feed unavailable: " + (e.message || "timeout").slice(0, 200)
        });
      }
      return;
    }

    if (name === "status") {
      await interaction.deferReply();
      const sum = getTrackerSummary();
      const board = getCurrentBoard();
      const health = await runHealthCheck({ discordReady, schedulerArmed });
      const e = new EmbedBuilder()
        .setColor(health.ok ? 0x2ecc71 : 0xe74c3c)
        .setTitle("📡 SYSTEM STATUS")
        .setDescription(
          [
            ...health.lines,
            "",
            `**Board:** ${board ? (board.stale ? "STALE" : board.emptyBoard ? "WAITING FOR GAMES" : "LIVE") : "none yet"}`,
            `**Tracker:** ${sum.record} (${sum.pending} pending)`,
            `**Channel:** ${config.picsChannelId ? "set" : "MISSING PICS_CHANNEL_ID"}`,
            `**Scan interval:** ${config.scanMinutes || 15}m · PORT ${PORT}`
          ].join("\n")
        )
        .setFooter({ text: "EDGE PLAY · health check · 21+" })
        .setTimestamp();
      await interaction.editReply({ embeds: [e] });
      return;
    }

    if (name === "updates") {
      await interaction.deferReply();
      const alerts = await runChangeAnnounce();
      if (!alerts.length) {
        await interaction.editReply({ content: "No material changes detected on current board." });
      } else {
        await interaction.editReply(alerts[0]);
        for (const a of alerts.slice(1)) await interaction.followUp(a).catch(() => {});
      }
      return;
    }

    if (name === "refresh") {
      await interaction.deferReply();
      const r = await refreshData();
      await interaction.editReply({
        content: r?.ok
          ? "Odds backend refresh OK."
          : "Odds backend offline or not configured — daily engine uses ESPN public feeds only."
      });
      return;
    }

    if (name === "track" || name === "pl") {
      await interaction.reply({ embeds: [trackerSummaryEmbed()] });
      return;
    }
    if (name === "review") {
      await interaction.reply({ embeds: [enhanceReviewEmbed()] });
      return;
    }
    if (name === "learn") {
      await interaction.reply({ embeds: [learnEmbed()] });
      return;
    }
    if (name === "pending") {
      await interaction.reply({ embeds: [trackerPendingEmbed()] });
      return;
    }

    if (name === "logpick") {
      const sport = interaction.options.getString("sport", true);
      const selection = interaction.options.getString("selection", true);
      const odds = interaction.options.getNumber("odds", true);
      const units = interaction.options.getNumber("units", true);
      if (!Number.isFinite(odds) || !Number.isFinite(units) || units <= 0) {
        await interaction.reply({ content: "Invalid odds or units.", ephemeral: true });
        return;
      }
      const row = logPick({
        sport,
        selection,
        odds,
        units,
        label: interaction.options.getString("label") || "LEAN",
        market: interaction.options.getString("market") || "ml",
        game: interaction.options.getString("game") || "",
        reasons: interaction.options.getString("reasons") || ""
      });
      await interaction.reply({
        content: `Logged \`${row.id}\` **${sport}** ${selection} ${odds > 0 ? "+" : ""}${odds} · ${units}u · ${row.label}`,
        ephemeral: true
      });
      return;
    }

    if (name === "grade") {
      const result = (interaction.options.getString("result", true) || "").toLowerCase();
      if (!["win", "loss", "push"].includes(result)) {
        await interaction.reply({ content: "result must be win | loss | push", ephemeral: true });
        return;
      }
      const id = interaction.options.getString("id");
      const selection = interaction.options.getString("selection");
      if (!id && !selection) {
        await interaction.reply({ content: "Provide id or selection", ephemeral: true });
        return;
      }
      const row = gradePick({
        result,
        id,
        selection,
        closingOdds: interaction.options.getNumber("closing")
      });
      if (!row) {
        await interaction.reply({ content: "Pick not found in pending ledger.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `Graded \`${row.id}\` → **${result.toUpperCase()}** · PL ${row.pl >= 0 ? "+" : ""}${Number(row.pl).toFixed(2)}u`,
        ephemeral: true
      });
      return;
    }

    if (SPORT_KEYS.has(name)) {
      if (name === "kalshi") {
        await interaction.reply({ embeds: [kalshiEmbed()] });
        return;
      }
      const emb = categoryEmbed(name);
      if (emb) await interaction.reply({ embeds: [emb] });
      else {
        await interaction.reply({
          content: `No desk data for **${name}**. Run \`/daily\` first.`,
          ephemeral: true
        });
      }
      return;
    }

    if (["value", "props", "prop", "parlay", "parlays"].includes(name)) {
      await interaction.reply({ embeds: [liveCardEmbed()] });
      return;
    }

    await interaction.reply({
      content: `Unknown command \`/${name}\`. Try \`/help\`.`,
      ephemeral: true
    });
  } catch (e) {
    console.error("[interaction]", name, e);
    const msg = { content: "Desk hiccup — try again in a moment.", ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {
      /* swallow */
    }
  }
});

client.login(config.token).catch((e) => {
  console.error("FATAL Discord login failed:", e.message);
  process.exit(1);
});
