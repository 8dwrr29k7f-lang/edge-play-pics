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
import { fetchMultiScores } from "./liveScores.js";
import { runScan } from "./scanner.js";
import {
  liveBestBetsEmbed,
  liveLocksEmbed,
  livePLEmbed,
  liveAllPicksEmbed
} from "./liveEmbeds.js";
import { refreshData } from "./liveApi.js";
import {
  categoryEmbed,
  bestOverallEmbed,
  allLocksEmbed,
  mediaAllEmbed
} from "./categoryEmbed.js";
import { categories } from "./data/desk.js";
import { lotdEmbed, liveCardEmbed, locksTodayEmbed } from "./lotdEmbed.js";
import { scanCashoutAlerts, hedgesEmbed } from "./cashout.js";
import { leanEmbed, holdEmbed, mediaFollowEmbed } from "./mediaFollow.js";
import {
  morningBundle,
  eveningBundle,
  runChangeAnnounce,
  initSnapshotIfEmpty
} from "./announce.js";
import { learnEmbed, enhanceReviewEmbed } from "./trackerLearn.js";
import { rollDailyCard, ensureTodayCard, getLastBoard } from "./dailyRoll.js";
import { getCurrentBoard, getTrackerSummary, reverifyPicks } from "./dailyEngine.js";
import { registerCommandsOnBoot } from "./registerOnBoot.js";
import {
  logPick,
  gradePick,
  ingestLivePicks,
  trackerSummaryEmbed,
  trackerReviewEmbed,
  trackerPendingEmbed
} from "./tracker.js";

assertConfig();

const PORT = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("EDGE PLAY PICS · alive\n");
}).listen(PORT, () => console.log(`Health listener on :${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

async function postToPics(payload) {
  const chId = config.picsChannelId;
  if (!chId) {
    console.warn("PICS_CHANNEL_ID not set — skip auto post");
    return;
  }
  try {
    const ch = await client.channels.fetch(chId);
    if (!ch || !ch.isTextBased()) return;
    if (Array.isArray(payload)) {
      for (const p of payload) await ch.send(p).catch((e) => console.warn("post:", e.message));
    } else {
      await ch.send(payload).catch((e) => console.warn("post:", e.message));
    }
  } catch (e) {
    console.warn("postToPics:", e.message);
  }
}

const SPORT_KEYS = new Set([
  "kbo", "npb", "tennis", "soccer", "mma", "boxing", "mlb", "nfl", "nba", "esports", "kalshi"
]);

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    await registerCommandsOnBoot();
  } catch (e) {
    console.warn("registerCommandsOnBoot:", e.message);
  }
  client.user.setActivity("EDGE PLAY · daily engine", { type: ActivityType.Watching });

  initSnapshotIfEmpty();

  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("🌅 DAILY SCAN starting...");
      try {
        const embeds = await morningBundle();
        await postToPics(embeds);
      } catch (e) {
        console.error("morningBundle:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 12 * * *",
    async () => {
      console.log("🔄 PRE-GAME MONITOR...");
      try {
        const alerts = await runChangeAnnounce();
        if (alerts.length) await postToPics(alerts);
      } catch (e) {
        console.error("midday monitor:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 16 * * *",
    async () => {
      console.log("🔄 PRE-GAME MONITOR 16:00...");
      try {
        await reverifyPicks();
        const alerts = await runChangeAnnounce();
        if (alerts.length) await postToPics(alerts);
      } catch (e) {
        console.error("16:00 monitor:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("🌆 EVENING REVIEW...");
      try {
        const embeds = await eveningBundle();
        await postToPics(embeds);
      } catch (e) {
        console.error("eveningBundle:", e.message);
      }
    },
    { timezone: "America/Chicago" }
  );

  const mins = config.scanMinutes || 15;
  setInterval(async () => {
    try {
      await reverifyPicks();
    } catch (e) {
      console.warn("interval reverify:", e.message);
    }
  }, mins * 60 * 1000);

  setTimeout(async () => {
    try {
      console.log("Boot scan...");
      await ensureTodayCard();
      console.log("Boot board ready");
    } catch (e) {
      console.warn("boot scan:", e.message);
    }
  }, 5000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;
  try {
    // ── Help ──────────────────────────────────────────────
    if (name === "help") {
      await interaction.reply({ embeds: [helpEmbed()] });
      return;
    }

    // ── Daily board ───────────────────────────────────────
    if (name === "daily" || name === "card" || name === "roll") {
      await interaction.deferReply();
      const board = await ensureTodayCard();
      const e = new EmbedBuilder()
        .setColor(board?.noPlay ? 0xe74c3c : 0x2ecc71)
        .setTitle(board?.noPlay ? "🚫 NO QUALIFYING PLAY TODAY" : "📡 DAILY BOARD")
        .setDescription((board?.text || "No board.").slice(0, 4000))
        .setFooter({ text: "EDGE PLAY · never force locks · 21+" })
        .setTimestamp();
      await interaction.editReply({ embeds: [e] });
      return;
    }

    if (name === "scan") {
      await interaction.deferReply();
      const board = await rollDailyCard({ force: true });
      const e = new EmbedBuilder()
        .setColor(board?.noPlay ? 0xe74c3c : 0x2ecc71)
        .setTitle("🔬 FORCED SCAN COMPLETE")
        .setDescription((board?.text || "Done.").slice(0, 4000))
        .setTimestamp();
      await interaction.editReply({ embeds: [e] });
      return;
    }

    // ── Evidence cards ────────────────────────────────────
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

    // ── Lean / Hold / Media ───────────────────────────────
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

    // ── Hedge / cashout ───────────────────────────────────
    if (name === "hedge" || name === "cashout") {
      await interaction.reply({ embeds: [hedgesEmbed()] });
      return;
    }

    // ── Limits / scores ───────────────────────────────────
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

    // ── Status / updates / refresh ────────────────────────
    if (name === "status") {
      const sum = getTrackerSummary();
      const board = getCurrentBoard();
      const e = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("📡 SYSTEM STATUS")
        .setDescription(
          [
            `**Discord:** online · PORT ${PORT}`,
            `**Channel:** ${config.picsChannelId ? "set" : "MISSING PICS_CHANNEL_ID"}`,
            `**Tracker:** ${sum.record} (${sum.pending} pending)`,
            `**Board:** ${board ? (board.stale ? "STALE" : board.noPlay ? "NO PLAY" : "LIVE") : "none yet"}`,
            `**Scan interval:** ${config.scanMinutes || 15}m`,
            `**Engine:** active (evidence + autopsy)`,
            `**Odds API:** ${config.apiBase ? config.apiBase : "not configured (ESPN-only)"}`
          ].join("\n")
        )
        .setFooter({ text: "EDGE PLAY · health check · 21+" })
        .setTimestamp();
      await interaction.reply({ embeds: [e] });
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

    // ── Tracker ───────────────────────────────────────────
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
      const label = interaction.options.getString("label") || "LEAN";
      const market = interaction.options.getString("market") || "ml";
      const game = interaction.options.getString("game") || "";
      const reasons = interaction.options.getString("reasons") || "";
      const row = logPick({
        sport,
        selection,
        odds,
        units,
        label,
        market,
        game,
        reasons
      });
      await interaction.reply({
        content: `Logged \`${row.id}\` **${sport}** ${selection} ${odds > 0 ? "+" : ""}${odds} · ${units}u · ${label}`,
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
      const closing = interaction.options.getNumber("closing");
      if (!id && !selection) {
        await interaction.reply({ content: "Provide id or selection", ephemeral: true });
        return;
      }
      const row = gradePick({ result, id, selection, closingOdds: closing });
      if (!row) {
        await interaction.reply({ content: "Pick not found in pending ledger.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `Graded \`${row.id}\` → **${result.toUpperCase()}** · PL ${row.pl >= 0 ? "+" : ""}${row.pl}u`,
        ephemeral: true
      });
      return;
    }

    // ── Sport desks ───────────────────────────────────────
    if (SPORT_KEYS.has(name)) {
      if (name === "kalshi") {
        await interaction.reply({ embeds: [kalshiEmbed()] });
        return;
      }
      const emb = categoryEmbed(name);
      if (emb) {
        await interaction.reply({ embeds: [emb] });
      } else {
        await interaction.reply({
          content: `No desk data for **${name}** yet. Run \`/daily\` to populate from live scan.`,
          ephemeral: true
        });
      }
      return;
    }

    // ── Live OpticOdds-style embeds (graceful if offline) ─
    if (name === "value" || name === "props" || name === "prop" || name === "parlay" || name === "parlays") {
      await interaction.reply({ embeds: [liveCardEmbed()] });
      return;
    }

    // Fallback
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
      /* ignore secondary failures */
    }
  }
});

client.login(config.token).catch((e) => {
  console.error("FATAL Discord login failed:", e.message);
  process.exit(1);
});
