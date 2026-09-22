#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."

if [ ! -f src/index.js ]; then
  if [ ! -f src.zip ]; then
    echo "FATAL: no src/index.js and no src.zip"
    ls -la
    exit 1
  fi
  echo "Unpacking src.zip into src/ (python)..."
  mkdir -p src
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')"
  elif command -v python >/dev/null 2>&1; then
    python -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')"
  elif command -v unzip >/dev/null 2>&1; then
    unzip -qo src.zip -d src
  else
    echo "FATAL: need python3 or unzip to unpack src.zip"
    exit 1
  fi
fi

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js still missing after unpack"
  ls -la src || true
  exit 1
fi

echo "Launching node src/index.js"
exec node src/index.js
