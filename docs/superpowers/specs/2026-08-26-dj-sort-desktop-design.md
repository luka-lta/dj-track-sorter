# DJ Track Sorter Desktop App — Design

Datum: 2026-08-26
Status: approved

## Ziel

Bestehendes CLI-Script `sort_tracks.py` (sortiert Audiodateien aus einem
"Neu"-Ordner anhand rekordbox-MyTags in Genre-Ordner, setzt MyTags in
der rekordbox-Datenbank) als Desktop-App für macOS und Windows
verpacken. Kein Server/Backend-Prozess im Netzwerk-Sinn — App läuft
komplett lokal auf dem Gerät des Nutzers.

v2 (nicht Teil dieser Spec, aber Architektur soll es zulassen):
SoundCloud-Tracks per URL herunterladen inkl. Metadaten, landen im
"Neu"-Ordner und laufen durch denselben Sortier-Flow.

## Architektur

Electron-App (Chromium-UI + Node Main-Process) mit Python als
gebündeltem Sidecar-Binary (PyInstaller-Executable, keine
Python-Installation beim Nutzer nötig). Electron startet das Sidecar
als Subprozess beim App-Start und kommuniziert über
stdin/stdout-JSON-Messages (Request/Response, z.B. `{"cmd": "scan"}` →
`{"tracks": [...]}`). Kein Netzwerk, kein Server-Port.

Begründung: `pyrekordbox` löst SQLCipher-Verschlüsselung und
Datenbank-Schema von rekordbox bereits zuverlässig — ein Nachbau in
Rust/JS wäre eigener großer Reverse-Engineering-Aufwand mit Risiko bei
rekordbox-Updates. Electron erlaubt eine schickere UI als eine reine
Qt-Lösung, bei vertretbarem Mehraufwand (zwei Runtimes im Paket).

## Komponenten

### Python-Backend (`backend/`)

- `db.py` — `open_db()`, `build_content_lookup()` (aus bestehendem
  Script übernommen)
- `sorter.py` — `genre_from_content()`, `find_mytag()`, `set_mytag()`,
  Move-Logik, Plan-Berechnung (aus bestehendem Script übernommen)
- `ipc.py` — JSON-stdin/stdout-Loop, Command-Dispatch:
  - `get_settings` — liefert aktuelle Pfade + `KNOWN_GENRES`
  - `save_settings` — speichert Settings
  - `scan` — liest "Neu"-Ordner + rekordbox-DB, matched Tracks
  - `plan` — berechnet geplante Aktionen (Move-Ziel, MyTag-Set,
    Warnungen) ohne zu schreiben
  - `execute` — führt geplante Aktionen aus (MyTags setzen, Dateien
    verschieben, DB committen)

Kein interaktives `input()` mehr — UI übernimmt die Nutzer-Interaktion.

### Electron Main-Process (`main/`)

- App-Lifecycle, Sidecar-Prozess starten/beenden/überwachen
- IPC-Bridge zwischen Renderer und Python-Sidecar
- `contextBridge` für sicheren Renderer-Zugriff (kein direkter
  Node-Zugriff im Renderer)
- Ordner-Auswahl-Dialoge (`dialog.showOpenDialog`)

### Renderer/UI (`src/`)

- Track-Liste: erkannte Genres (automatisch, aus MyTag) vs. offene
  Tracks (Dropdown-Auswahl aus `KNOWN_GENRES` oder "Überspringen")
- Bestätigungs-Dialog: zeigt `plan`-Ergebnis vor jeder Ausführung
  (Vorschau-Pflicht vor jedem Lauf, ersetzt reinen DRY_RUN-Toggle)
- Settings-Screen: Ordner-Picker für "Neu"-Ordner und DJ-Root,
  Verwaltung von `KNOWN_GENRES`, DRY_RUN-Toggle bleibt zusätzlich
  erhalten (für Entwicklung/Debugging)
- Log-Panel: Ergebnis pro Track nach Ausführung (Erfolg, übersprungen,
  Fehler)

### Settings-Storage

Lokale JSON-Datei unter `app.getPath('userData')/settings.json`:
Ordner-Pfade, `KNOWN_GENRES`-Liste, DRY_RUN-Flag.

## Datenfluss

1. App-Start → Sidecar hochfahren → `get_settings` → Pfade/Genres in
   UI laden.
2. Nutzer klickt "Scannen" → `scan` → Backend liest "Neu"-Ordner +
   rekordbox-DB, matched Tracks gegen MyTags.
3. UI zeigt Liste: Tracks mit erkanntem Genre (automatisch) + Tracks
   ohne (manuelle Auswahl nötig).
4. Nutzer füllt offene Genres aus → "Vorschau" → `plan` → Ergebnis in
   Bestätigungs-Dialog (1:1 wie später ausgeführt).
5. Nutzer bestätigt → `execute` → Backend setzt MyTags, verschiebt
   Dateien, committed DB → Ergebnis-Log in UI.

## Error-Handling

- rekordbox läuft noch (DB gesperrt): Backend fängt Exception beim
  `open_db()`, meldet klaren Fehler → UI zeigt Dialog "Bitte rekordbox
  schließen" mit Retry-Button.
- Sidecar crasht/hängt: Main-Process erkennt Exit-Code/Timeout, UI
  zeigt Fehlerbanner mit Neustart-Option.
- Zieldatei existiert bereits: Track wird übersprungen (kein
  Datenverlust), erscheint im Ergebnis-Log.

## Testing

- Python-Backend: pytest für reine Funktionen (`genre_from_content`,
  Pfad-Matching, Plan-Berechnung) mit einfachen Testdouble-Objekten
  statt Mocks (Datenobjekte, keine Mocks laut Testkonventionen).
- Electron: manueller Testlauf gegen Kopie einer echten rekordbox-DB
  (Backup) und Dummy-Audiodateien im "Neu"-Ordner.
- Kein CI/Code-Signing-Zwang für v1 — lokale Builds (PyInstaller +
  electron-builder) reichen, Nutzer klickt Gatekeeper/SmartScreen
  einmalig weg.

## v2-Vorbereitung (nicht implementiert)

IPC-Command-Namespace jetzt schon so halten, dass ein künftiger
`download`-Command (SoundCloud-URL → `yt-dlp` + `mutagen` für
Metadaten-Tagging → Datei landet im "Neu"-Ordner → läuft durch
denselben Sortier-Flow) sich einfügen lässt, ohne bestehende Commands
umzubauen.
