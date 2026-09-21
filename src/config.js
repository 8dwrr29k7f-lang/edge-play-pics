import "dotenv/config";

export const config = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  picsChannelId:
    process.env.PICS_CHANNEL_ID || process.env.KBO_CHANNEL_ID || "",
  kboChannelId: process.env.KBO_CHANNEL_ID || "",
  scanMinutes: Math.max(5, Number(process.env.SCAN_MINUTES || 15)),
  apiBase: process.env.EDGE_PLAY_API || "http://127.0.0.1:3777",
  colors: {
    navy: 0x0a1628,
    gold: 0xc4a35a,
    take: 0x7dcea0,
    sit: 0xd98880,
    lean: 0xc4a35a,
    muted: 0x2a3544,
    lock: 0xf1c40f
  },
  rules: {
    maxTickets: 2,
    maxUnitsAm: 0.75,
    maxUnitsDay: 5,
    sitCents: 0.72,
    lockCentsMax: 0.65,
    lockAmericanMax: -150
  }
};

export function assertConfig() {
  if (!config.token) {
    console.error("Missing DISCORD_TOKEN in .env");
    process.exit(1);
  }
  if (!config.clientId) {
    console.warn("CLIENT_ID missing — slash command registration may fail");
  }
}
