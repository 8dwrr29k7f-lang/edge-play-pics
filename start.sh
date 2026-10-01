#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."

# Prefer already-unpacked source of truth. Only try zip if src/index.js is missing.
if [ ! -f src/index.js ]; then
  if [ -f src.zip ]; then
    echo "src/index.js missing — unpacking src.zip..."
    node extract.mjs || {
      echo "extract failed — fallback"
      mkdir -p src
      unzip -qo src.zip -d src 2>/dev/null || python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')" 2>/dev/null || true
    }
  fi
fi

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing after unpack attempt"
  ls -la . src 2>/dev/null || true
  exit 1
fi

echo "Skip overlay (src is source of truth): analyticsEngine pickFormat ..."
# Safe overlays only (config + a few non-engine files). Engine stays from src/.
node patch-register.mjs || echo "WARN: patch-register"
node overlay_takes_patch.mjs || echo "WARN: takes"
node overlay_names_patch.mjs || echo "WARN: names"

[ -f overlay_config.js ] && cp -f overlay_config.js src/config.js && echo "OK config"
[ -f overlay_categoryEmbed.js ] && cp -f overlay_categoryEmbed.js src/categoryEmbed.js && echo "OK categoryEmbed"
[ -f overlay_liveEmbeds.js ] && cp -f overlay_liveEmbeds.js src/liveEmbeds.js && echo "OK liveEmbeds"
[ -f overlay_lotdEmbed.js ] && cp -f overlay_lotdEmbed.js src/lotdEmbed.js && echo "OK lotdEmbed"
[ -f overlay_dailyRoll.js ] && cp -f overlay_dailyRoll.js src/dailyRoll.js && echo "OK dailyRoll"
# Intentionally do NOT overwrite analyticsEngine / pickFormat from large overlays unless needed
node overlay_export_guard.mjs || echo "WARN: export_guard"

node --input-type=module -e "
import * as c from './src/config.js';
import * as d from './src/dailyRoll.js';
if (!c.assertConfig) { console.error('FATAL: assertConfig missing'); process.exit(1); }
if (!d.rollDailyCard || !d.ensureTodayCard) {
  console.error('FATAL: dailyRoll missing exports', Object.keys(d));
  process.exit(1);
}
console.log('export check OK');
" || exit 1

echo "Env TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set}"
echo "Launching node src/index.js"
exec node src/index.js
