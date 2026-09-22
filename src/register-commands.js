import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config, assertConfig } from "./config.js";

assertConfig();

const sportCmds = [
  ["kbo", "KBO desk — best take + clear locks"],
  ["npb", "NPB Japan desk"],
  ["tennis", "Tennis desk"],
  ["soccer", "Soccer desk"],
  ["mma", "MMA / UFC desk"],
  ["boxing", "Boxing desk"],
  ["mlb", "MLB desk"],
  ["nfl", "NFL desk"],
  ["nba", "NBA desk"],
  ["esports", "Esports desk"],
  ["kalshi", "Kalshi-wide desk"]
];

const commands = [
  new SlashCommandBuilder().setName("pics").setDescription("👑 Main premium board"),
  new SlashCommandBuilder().setName("wire").setDescription("👑 Main board (alias)"),
  new SlashCommandBuilder().setName("updates").setDescription("📢 Force check pick/media changes + announce"),
  new SlashCommandBuilder().setName("daily").setDescription("📅 Force new daily card from live ESPN scan"),
  new SlashCommandBuilder().setName("roll").setDescription("📅 Roll daily card (alias)"),
  new SlashCommandBuilder().setName("lean").setDescription("➖ Who to LEAN + only-if price"),
  new SlashCommandBuilder().setName("hold").setDescription("⏸️ Who to HOLD + wait trigger"),
  new SlashCommandBuilder().setName("follow").setDescription("📡 Media follow board"),
  new SlashCommandBuilder().setName("hedge").setDescription("🛡️ Hedges & cash-out rules"),
  new SlashCommandBuilder().setName("cashout").setDescription("🚨 Cash-out rules (alias)"),
  new SlashCommandBuilder().setName("lotd").setDescription("👑 Lock of the Day — full write-up"),
  new SlashCommandBuilder().setName("lock").setDescription("👑 Lock of the Day (alias)"),
  new SlashCommandBuilder().setName("live").setDescription("📡 Live card — all sports picks + PASS board"),
  new SlashCommandBuilder().setName("best").setDescription("⭐ Best bets — live from OpticOdds"),
  new SlashCommandBuilder().setName("locks").setDescription("🔒 LOCKs & CAPs — live from OpticOdds"),
  new SlashCommandBuilder().setName("media").setDescription("📡 Media bets + overall every sport"),
  new SlashCommandBuilder().setName("scan").setDescription("📡 Force refresh from OpticOdds + post"),
  new SlashCommandBuilder().setName("refresh").setDescription("📡 Force refresh odds from OpticOdds"),
  new SlashCommandBuilder().setName("picks").setDescription("📊 All live picks today"),
  new SlashCommandBuilder().setName("pl").setDescription("📊 Profit/Loss tracker"),
  new SlashCommandBuilder().setName("all").setDescription("📊 All picks (alias)"),
  new SlashCommandBuilder().setName("limits").setDescription("🛑 Unit rules"),
  new SlashCommandBuilder().setName("scores").setDescription("📺 MLB scores"),
  new SlashCommandBuilder().setName("track").setDescription("📊 Performance tracker summary"),
  new SlashCommandBuilder().setName("learn").setDescription("🧠 W/L model — priors for future picks"),
  new SlashCommandBuilder().setName("review").setDescription("🧠 Self-review patterns from graded history"),
  new SlashCommandBuilder().setName("pending").setDescription("⏳ Pending picks awaiting grade"),
  new SlashCommandBuilder()
    .setName("logpick")
    .setDescription("📝 Log a pick into the tracker")
    .addStringOption(o => o.setName("sport").setDescription("Sport").setRequired(true))
    .addStringOption(o => o.setName("selection").setDescription("Pick / selection").setRequired(true))
    .addNumberOption(o => o.setName("odds").setDescription("American odds e.g. -110").setRequired(true))
    .addNumberOption(o => o.setName("units").setDescription("Units risked").setRequired(true))
    .addStringOption(o => o.setName("label").setDescription("LOCK | CAP | VALUE | LEAN"))
    .addStringOption(o => o.setName("market").setDescription("ml | spread | total | prop"))
    .addStringOption(o => o.setName("game").setDescription("Game matchup"))
    .addStringOption(o => o.setName("reasons").setDescription("Why — short tags")),
  new SlashCommandBuilder()
    .setName("grade")
    .setDescription("✅ Grade a pick win/loss/push")
    .addStringOption(o => o.setName("result").setDescription("win | loss | push").setRequired(true))
    .addStringOption(o => o.setName("id").setDescription("Pick id from /pending"))
    .addStringOption(o => o.setName("selection").setDescription("Or match by selection text"))
    .addNumberOption(o => o.setName("closing").setDescription("Closing American odds (CLV)")),
  new SlashCommandBuilder().setName("status").setDescription("📡 Live feed status (ESPN + odds API)"),
  new SlashCommandBuilder().setName("help").setDescription("Command menu"),
  ...sportCmds.map(([name, desc]) =>
    new SlashCommandBuilder().setName(name).setDescription(desc)
  )
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

async function main() {
  console.log("Registering category commands…");
  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log("Guild register OK", config.guildId);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands
    });
    console.log("Global register OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
