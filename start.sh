#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set} GUILD=${GUILD_ID:+set} PICS=${PICS_CHANNEL_ID:+set} PORT=${PORT:-auto}"

# Always prefer fresh unpack from src.zip when present (avoids stale/partial src/)
if [ -f src.zip ]; then
  echo "Unpacking src.zip..."
  node extract.mjs || {
    echo "extract.mjs failed — trying unzip/python"
    mkdir -p src
    unzip -qo src.zip -d src 2>/dev/null || python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')" || true
  }
fi

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing after unpack"
  ls -la . src 2>/dev/null || true
  exit 1
fi

# Apply overlays / patches so named picks + register-on-boot win
node patch-register.mjs || echo "WARN: patch-register"
node overlay_takes_patch.mjs || echo "WARN: takes"
node overlay_names_patch.mjs || echo "WARN: names"

[ -f overlay_config.js ] && cp overlay_config.js src/config.js && echo "Overlay config"
[ -f overlay_pickFormat.js ] && cp overlay_pickFormat.js src/pickFormat.js && echo "Overlay pickFormat"
[ -f overlay_lotdEmbed.js ] && cp overlay_lotdEmbed.js src/lotdEmbed.js && echo "Overlay lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp overlay_liveEmbeds.js src/liveEmbeds.js && echo "Overlay liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp overlay_analyticsEngine.js src/analyticsEngine.js && echo "Overlay analytics"
[ -f overlay_categoryEmbed.js ] && cp overlay_categoryEmbed.js src/categoryEmbed.js && echo "Overlay category"
[ -f overlay_mediaFollow.js ] && cp overlay_mediaFollow.js src/mediaFollow.js && echo "Overlay mediaFollow"

# Inject health listener if not already present (Railway needs a port)
if ! grep -q "Health listener" src/index.js 2>/dev/null; then
  echo "Injecting Railway health listener into src/index.js"
  node -e '
const fs = require("fs");
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
' || echo "WARN: inject failed"
fi

echo "Launching node src/index.js"
exec node src/index.js
