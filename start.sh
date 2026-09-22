#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set} GUILD=${GUILD_ID:+set} PICS=${PICS_CHANNEL_ID:+set} PORT=${PORT:-auto}"

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing"
  ls -la . src 2>/dev/null || true
  exit 1
fi

if [ ! -f src/data/desk.js ]; then
  echo "FATAL: src/data/desk.js missing — incomplete source tree"
  ls -la src src/data 2>/dev/null || true
  exit 1
fi

# Optional overlays (safe if already applied in repo)
[ -f overlay_config.js ] && cp -f overlay_config.js src/config.js && echo "Overlay: config"
[ -f overlay_pickFormat.js ] && cp -f overlay_pickFormat.js src/pickFormat.js && echo "Overlay: pickFormat"
[ -f overlay_lotdEmbed.js ] && cp -f overlay_lotdEmbed.js src/lotdEmbed.js && echo "Overlay: lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp -f overlay_liveEmbeds.js src/liveEmbeds.js && echo "Overlay: liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp -f overlay_analyticsEngine.js src/analyticsEngine.js && echo "Overlay: analytics"
[ -f overlay_categoryEmbed.js ] && cp -f overlay_categoryEmbed.js src/categoryEmbed.js && echo "Overlay: category"
[ -f overlay_mediaFollow.js ] && cp -f overlay_mediaFollow.js src/mediaFollow.js && echo "Overlay: mediaFollow"

# Ensure health listener exists (Railway needs something on $PORT)
if ! grep -q "Health listener" src/index.js 2>/dev/null; then
  echo "Injecting Railway health listener..."
  node --input-type=module -e '
import fs from "fs";
let t = fs.readFileSync("src/index.js", "utf8");
if (!t.includes("import http")) {
  t = t.replace("from \"discord.js\";", "from \"discord.js\";\nimport http from \"http\";");
}
if (!t.includes("Health listener")) {
  t = t.replace(
    "assertConfig();\n\nconst client = new Client({",
    `assertConfig();

const PORT = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("EDGE PLAY PICS · alive\\n");
}).listen(PORT, () => console.log("Health listener on :" + PORT));

const client = new Client({`
  );
}
if (!t.includes("FATAL Discord login failed")) {
  t = t.replace(
    "client.login(config.token);",
    `client.login(config.token).catch((e) => {
  console.error("FATAL Discord login failed:", e.message);
  process.exit(1);
});`
  );
}
fs.writeFileSync("src/index.js", t);
console.log("Health + login guard injected");
' || echo "WARN: inject skipped"
fi

echo "Launching node src/index.js"
exec node src/index.js
