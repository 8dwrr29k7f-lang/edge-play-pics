import { EmbedBuilder } from "discord.js";
export function lotdEmbed() { return new EmbedBuilder().setTitle("Lock of the Day").setDescription("See /daily"); }
export function liveCardEmbed() { return new EmbedBuilder().setTitle("Live Card").setDescription("See /daily"); }
export function locksTodayEmbed() { return new EmbedBuilder().setTitle("Locks Today").setDescription("See /locks"); }
