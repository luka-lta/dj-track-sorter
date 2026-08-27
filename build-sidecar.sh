#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"

if [ -f .venv/Scripts/pyinstaller.exe ]; then
  PYINSTALLER=.venv/Scripts/pyinstaller.exe
else
  PYINSTALLER=.venv/bin/pyinstaller
fi

"$PYINSTALLER" --onefile --name dj-sorter-sidecar main.py \
  --distpath ../resources/sidecar --workpath build --specpath build
