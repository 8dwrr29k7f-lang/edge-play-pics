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
import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";
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

// Railway healthcheck
const PORT = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("EDGE PLAY PICS · alive\n");
}).listen(PORT, () => console.log(`Health listener on :${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

const SPORT_KEYS = Object.keys(categories || {});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    await registerCommandsOnBoot();
  } catch (e) {
    console.warn("registerCommandsOnBoot:", e.message);
  }
  client.user.setActivity("EDGE PLAY PICS", { type: ActivityType.Watching });
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
      await interaction.reply({ embeds: [liveCardEmbed() || lotdEmbed()] });
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
      await interaction.reply({
        content: `Bot online · PORT ${PORT} · channel ${config.picsChannelId ? "set" : "MISSING"}`
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
