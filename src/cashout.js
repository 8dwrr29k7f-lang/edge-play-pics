/**
 * Cash-out / hedge alerts — automatic channel announcements
 */
import { EmbedBuilder } from "discord.js";
import { config } from "./config.js";

export function scanCashoutAlerts() {
  // Placeholder — real logic lives in overlays / full source
  return [];
}

export function hedgesEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors?.muted || 0x2a3544)
    .setTitle("Hedges / Cash-out")
    .setDescription("No active hedges right now.")
    .setFooter({ text: "EDGE PLAY · 21+" });
}
