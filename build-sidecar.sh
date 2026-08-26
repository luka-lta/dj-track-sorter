#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
.venv/bin/pyinstaller --onefile --name dj-sorter-sidecar main.py \
  --distpath ../resources/sidecar --workpath build --specpath build
