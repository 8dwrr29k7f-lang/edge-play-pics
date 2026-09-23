import { EmbedBuilder } from "discord.js";
import { liveCardEmbed, locksTodayEmbed } from "./lotdEmbed.js";
import { trackerSummaryEmbed } from "./tracker.js";
import { bestOverallEmbed } from "./categoryEmbed.js";

export function liveBestBetsEmbed() {
  try {
    return bestOverallEmbed();
  } catch {
    return new EmbedBuilder()
      .setTitle("⭐ Best Bets")
      .setDescription("No live OpticOdds feed. Use `/daily` for ESPN evidence board.")
      .setTimestamp();
  }
}

export function liveLocksEmbed() {
  try {
    return locksTodayEmbed();
  } catch {
    return new EmbedBuilder()
      .setTitle("🔒 Locks")
      .setDescription("No live locks. Run `/daily`.")
      .setTimestamp();
  }
}

export function livePLEmbed() {
  try {
    return trackerSummaryEmbed();
  } catch {
    return new EmbedBuilder()
      .setTitle("📊 P/L")
      .setDescription("Tracker unavailable.")
      .setTimestamp();
  }
}

export function liveAllPicksEmbed() {
  try {
    return liveCardEmbed();
  } catch {
    return new EmbedBuilder()
      .setTitle("📊 All Picks")
      .setDescription("No board yet. Run `/daily`.")
      .setTimestamp();
  }
}
