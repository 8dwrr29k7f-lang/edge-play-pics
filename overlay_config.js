import { createRequire } from "module";
try {
  const require = createRequire(import.meta.url);
  require("dotenv").config();
} catch {
  /* Railway injects env */
}

export const config = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  picsChannelId:
    process.env.PICS_CHANNEL_ID || process.env.KBO_CHANNEL_ID || "",
  kboChannelId: process.env.KBO_CHANNEL_ID || "",
  scanMinutes: Math.max(5, Number(process.env.SCAN_MINUTES || 15)),
  apiBase: process.env.EDGE_PLAY_API || "",
  colors: {
    navy: 0x0b1c2d,
    gold: 0xc4a35a,
    green: 0x2ecc71,
    red: 0xe74c3c,
    blue: 0x3498db
  }
};
