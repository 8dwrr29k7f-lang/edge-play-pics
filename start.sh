#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set} GUILD=${GUILD_ID:+set} PICS=${PICS_CHANNEL_ID:+set} PORT=${PORT:-auto}"

# Recover full source if desk.js is missing (previous bad src.zip commits)
if [ ! -f src/data/desk.js ] || [ ! -f src/announce.js ]; then
  echo "Incomplete src/ — recovering full source from known-good commit..."
  mkdir -p src
  # Known good zip from before corruption (commit 730616d...)
  GOOD_ZIP_URL="https://raw.githubusercontent.com/8dwrr29k7f-lang/edge-play-pics/730616d193a937853c3f012eb6dea098b257d4f3/src.zip"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$GOOD_ZIP_URL" -o /tmp/good-src.zip && unzip -qo /tmp/good-src.zip -d src && echo "Recovered via curl"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO /tmp/good-src.zip "$GOOD_ZIP_URL" && unzip -qo /tmp/good-src.zip -d src && echo "Recovered via wget"
  else
    echo "No curl/wget — trying python download"
    python3 -c "
import urllib.request, zipfile, os
urllib.request.urlretrieve('$GOOD_ZIP_URL', '/tmp/good-src.zip')
with zipfile.ZipFile('/tmp/good-src.zip') as z: z.extractall('src')
print('Recovered via python')
" || true
  fi
fi

if [ ! -f src/index.js ] || [ ! -f src/data/desk.js ]; then
  echo "FATAL: still missing src/index.js or src/data/desk.js after recovery"
  ls -la src src/data 2>/dev/null || true
  exit 1
fi

# Apply overlays so named picks + desk locks win
[ -f overlay_config.js ] && cp -f overlay_config.js src/config.js && echo "Overlay: config"
[ -f overlay_pickFormat.js ] && cp -f overlay_pickFormat.js src/pickFormat.js && echo "Overlay: pickFormat"
[ -f overlay_lotdEmbed.js ] && cp -f overlay_lotdEmbed.js src/lotdEmbed.js && echo "Overlay: lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp -f overlay_liveEmbeds.js src/liveEmbeds.js && echo "Overlay: liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp -f overlay_analyticsEngine.js src/analyticsEngine.js && echo "Overlay: analytics"
[ -f overlay_categoryEmbed.js ] && cp -f overlay_categoryEmbed.js src/categoryEmbed.js && echo "Overlay: category"
[ -f overlay_mediaFollow.js ] && cp -f overlay_mediaFollow.js src/mediaFollow.js && echo "Overlay: mediaFollow"
[ -f registerOnBoot.js ] && cp -f registerOnBoot.js src/registerOnBoot.js && echo "Overlay: registerOnBoot"

# Runtime patches for named picks / desk locks
node overlay_takes_patch.mjs 2>/dev/null || echo "WARN: takes patch"
node overlay_names_patch.mjs 2>/dev/null || echo "WARN: names patch"
node patch-register.mjs 2>/dev/null || echo "WARN: register patch"

# Inject health listener if missing (Railway needs $PORT)
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
