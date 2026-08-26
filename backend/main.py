import sys
from pathlib import Path

from ipc import run_loop

if __name__ == "__main__":
    settings_path = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        Path.home() / ".dj-track-sorter" / "settings.json"
    )
    run_loop(sys.stdin, sys.stdout, settings_path)
