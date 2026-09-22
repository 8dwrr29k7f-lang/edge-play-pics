import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "./config.js";

const sportCmds = [
  ["kbo", "KBO desk"], ["npb", "NPB desk"], ["tennis", "Tennis desk"],
  ["soccer", "Soccer desk"], ["mma", "MMA desk"], ["boxing", "Boxing desk"],
  ["mlb", "MLB desk"], ["nfl", "NFL desk"], ["nba", "NBA desk"],
  ["esports", "Esports desk"], ["kalshi", "Kalshi desk"]
];

function buildCommands() {
  return [
    new SlashCommandBuilder().setName("pics").setDescription("Main premium board"),
    new SlashCommandBuilder().setName("wire").setDescription("Main board"),
    new SlashCommandBuilder().setName("updates").setDescription("Force pick/media updates"),
    new SlashCommandBuilder().setName("daily").setDescription("Force new daily card"),
    new SlashCommandBuilder().setName("roll").setDescription("Roll daily card"),
    new SlashCommandBuilder().setName("lean").setDescription("Who to LEAN"),
    new SlashCommandBuilder().setName("hold").setDescription("Who to HOLD"),
    new SlashCommandBuilder().setName("follow").setDescription("Media follow board"),
    new SlashCommandBuilder().setName("hedge").setDescription("Hedges and cash-out"),
    new SlashCommandBuilder().setName("cashout").setDescription("Cash-out rules"),
    new SlashCommandBuilder().setName("lotd").setDescription("Play of the Day"),
    new SlashCommandBuilder().setName("lock").setDescription("Play of the Day alias"),
    new SlashCommandBuilder().setName("live").setDescription("Live card all picks"),
    new SlashCommandBuilder().setName("best").setDescription("Best bets"),
    new SlashCommandBuilder().setName("locks").setDescription("LOCKS and lockable"),
    new SlashCommandBuilder().setName("media").setDescription("Media bets map"),
    new SlashCommandBuilder().setName("value").setDescription("VALUE picks clear take list"),
    new SlashCommandBuilder().setName("props").setDescription("Player props section"),
    new SlashCommandBuilder().setName("prop").setDescription("Player props alias"),
    new SlashCommandBuilder().setName("parlay").setDescription("Parlay indications"),
    new SlashCommandBuilder().setName("parlays").setDescription("Parlays alias"),
    new SlashCommandBuilder().setName("scan").setDescription("Force scan and post"),
    new SlashCommandBuilder().setName("refresh").setDescription("Force refresh"),
    new SlashCommandBuilder().setName("picks").setDescription("All live picks"),
    new SlashCommandBuilder().setName("pl").setDescription("P/L tracker"),
    new SlashCommandBuilder().setName("all").setDescription("All picks"),
    new SlashCommandBuilder().setName("limits").setDescription("Unit rules"),
    new SlashCommandBuilder().setName("scores").setDescription("Live scores"),
    new SlashCommandBuilder().setName("track").setDescription("Performance tracker"),
    new SlashCommandBuilder().setName("learn").setDescription("W/L model"),
    new SlashCommandBuilder().setName("review").setDescription("Self-review"),
    new SlashCommandBuilder().setName("pending").setDescription("Pending picks"),
    new SlashCommandBuilder().setName("status").setDescription("Bot status"),
    new SlashCommandBuilder().setName("help").setDescription("Command menu"),
    ...sportCmds.map(([n, d]) => new SlashCommandBuilder().setName(n).setDescription(d))
  ].map((c) => c.toJSON());
}

export async function registerCommandsOnBoot() {
  if (!config.token || !config.clientId) {
    console.warn("registerOnBoot: missing TOKEN or CLIENT_ID");
    return;
  }
  const body = buildCommands();
  const rest = new REST({ version: "10" }).setToken(config.token);
  try {
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
      console.log("Slash commands registered guild", config.guildId, body.length);
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body });
      console.log("Slash commands registered GLOBAL", body.length);
    }
  } catch (e) {
    console.error("registerOnBoot FAILED:", e.message);
  }
}
