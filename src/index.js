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
import { wireEmbed, limitsEmbed, scoresEmbed, helpEmbed } from "./embeds.js";
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
      for (const p of payload) await ch.send(p).catch(e => console.warn("post:", e.message));
    } else {
      await ch.send(payload).catch(e => console.warn("post:", e.message));
    }
  } catch (e) {
    console.warn("postToPics:", e.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    await registerCommandsOnBoot();
  } catch (e) {
    console.warn("registerCommandsOnBoot:", e.message);
  }
  client.user.setActivity("EDGE PLAY · daily engine", { type: ActivityType.Watching });

  initSnapshotIfEmpty();

  cron.schedule("0 8 * * *", async () => {
    console.log("🌅 DAILY SCAN starting...");
    try {
      const embeds = await morningBundle();
      await postToPics(embeds);
    } catch (e) {
      console.error("morningBundle:", e.message);
    }
  }, { timezone: "America/Chicago" });

  cron.schedule("0 12 * * *", async () => {
    console.log("🔄 PRE-GAME MONITOR...");
    try {
      const alerts = await runChangeAnnounce();
      if (alerts.length) await postToPics(alerts);
    } catch (e) {
      console.error("midday monitor:", e.message);
    }
  }, { timezone: "America/Chicago" });

  cron.schedule("0 16 * * *", async () => {
    console.log("🔄 PRE-GAME MONITOR 16:00...");
    try {
      await reverifyPicks();
      const alerts = await runChangeAnnounce();
      if (alerts.length) await postToPics(alerts);
    } catch (e) {
      console.error("16:00 monitor:", e.message);
    }
  }, { timezone: "America/Chicago" });

  cron.schedule("0 20 * * *", async () => {
    console.log("🌆 EVENING REVIEW...");
    try {
      const embeds = await eveningBundle();
      await postToPics(embeds);
    } catch (e) {
      console.error("eveningBundle:", e.message);
    }
  }, { timezone: "America/Chicago" });

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
    if (name === "help") {
      await interaction.reply({ embeds: [helpEmbed()] });
      return;
    }
    if (name === "daily" || name === "card") {
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
    if (name === "locks") {
      await interaction.reply({ embeds: [locksTodayEmbed()] });
      return;
    }
    if (name === "lotd") {
      await interaction.reply({ embeds: [lotdEmbed()] });
      return;
    }
    if (name === "best") {
      await interaction.reply({ embeds: [bestOverallEmbed?.() || lotdEmbed()] });
      return;
    }
    if (name === "status") {
      const sum = getTrackerSummary();
      await interaction.reply({
        content: `Bot online · PORT ${PORT} · channel ${config.picsChannelId ? "set" : "MISSING"}\nTracker: ${sum.record} (${sum.pending} pending) · Engine: active`
      });
      return;
    }
    if (name === "track") {
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
    await interaction.reply({ content: "Try /help", ephemeral: true });
  } catch (e) {
    console.error(e);
    const msg = { content: "Desk hiccup — try again.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(config.token).catch((e) => {
  console.error("FATAL Discord login failed:", e.message);
  process.exit(1);
});
