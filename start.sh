#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."

if [ -f src.zip ]; then
  node extract.mjs || {
    echo "extract.mjs failed — trying unzip/python fallback"
    mkdir -p src
    unzip -qo src.zip -d src 2>/dev/null || python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')" 2>/dev/null || true
  }
fi

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing after extract"
  ls -la src 2>/dev/null || true
  exit 1
fi

node patch-register.mjs || echo "WARN: patch-register failed"
node overlay_takes_patch.mjs || echo "WARN: takes patch failed"
node overlay_names_patch.mjs || echo "WARN: names patch failed"

[ -f overlay_config.js ] && cp overlay_config.js src/config.js && echo "Copied config"
[ -f overlay_pickFormat.js ] && cp overlay_pickFormat.js src/pickFormat.js && echo "Copied pickFormat"
[ -f overlay_lotdEmbed.js ] && cp overlay_lotdEmbed.js src/lotdEmbed.js && echo "Copied lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp overlay_liveEmbeds.js src/liveEmbeds.js && echo "Copied liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp overlay_analyticsEngine.js src/analyticsEngine.js && echo "Copied analyticsEngine"
[ -f overlay_dailyRoll.js ] && cp overlay_dailyRoll.js src/dailyRoll.js && echo "Copied dailyRoll"

echo "Env check: TOKEN=${DISCORD_TOKEN:+set} CLIENT_ID=${CLIENT_ID:+set}"
echo "Launching node src/index.js"
exec node src/index.js
