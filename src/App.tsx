import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorView } from "@/components/screens/ErrorView";
import { TrackList } from "@/components/screens/TrackList";
import { TrackListSkeleton } from "@/components/screens/TrackListSkeleton";
import { ConfirmDialog } from "@/components/screens/ConfirmDialog";
import { LogPanel } from "@/components/screens/LogPanel";
import { SettingsDialog } from "@/components/screens/SettingsDialog";
import type {
  ExecuteResult,
  GenreChoices,
  PlanItem,
  ScanResult,
  Settings,
} from "@/types/dj-api";

const LOAD_TOAST_ID = "load-tracks";

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string; canRetry: boolean }
  | { name: "trackList" }
  | { name: "confirm"; plan: PlanItem[]; genreChoices: GenreChoices; selectedTracks: string[] }
  | { name: "log"; results: ExecuteResult[] };

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [crashed, setCrashed] = useState(false);

  useEffect(() => {
    window.djApi.onSidecarCrash(() => setCrashed(true));
  }, []);

  async function load() {
    setScreen({ name: "loading" });
    toast.loading("Lade Tracks & Tags...", { id: LOAD_TOAST_ID });

    let loadedSettings: Settings;
    try {
      loadedSettings = await window.djApi.getSettings();
    } catch (err) {
      const message = "Fehler beim Laden der Einstellungen: " + (err as Error).message;
      toast.error(message, { id: LOAD_TOAST_ID });
      setScreen({ name: "error", message, canRetry: true });
      return;
    }

    // Automatischer Sync beim Start — Fehlschlag blockiert den Flow nicht,
    // der anschließende scan()-Aufruf zeigt einen echten DB-Fehler ohnehin an.
    try {
      const { known_genres } = await window.djApi.syncGenres();
      loadedSettings = { ...loadedSettings, known_genres };
    } catch {
      // Bleibt bei den zuletzt gespeicherten known_genres, kein Abbruch.
    }

    let result: ScanResult;
    try {
      result = await window.djApi.scan();
    } catch (err) {
      const message = "Fehler beim Scannen: " + (err as Error).message;
      toast.error(message, { id: LOAD_TOAST_ID });
      setScreen({ name: "error", message, canRetry: true });
      return;
    }

    toast.success("Tracks & Tags geladen", { id: LOAD_TOAST_ID });
    setSettings(loadedSettings);
    setScanResult(result);
    setScreen({ name: "trackList" });
  }

  useEffect(() => {
    load();
  }, []);

  async function syncNow() {
    try {
      const { known_genres } = await window.djApi.syncGenres();
      setSettings((prev) => (prev ? { ...prev, known_genres } : prev));
      toast.success("Genres synchronisiert");
    } catch (err) {
      const message = "Fehler beim Synchronisieren: " + (err as Error).message;
      toast.error(message);
      setScreen({ name: "error", message, canRetry: true });
    }
  }

  async function handleSubmit(genreChoices: GenreChoices, selectedTracks: string[]) {
    let plan: PlanItem[];
    try {
      ({ plan } = await window.djApi.plan({ genreChoices, selectedTracks }));
    } catch (err) {
      const message = "Fehler bei der Vorschau: " + (err as Error).message;
      toast.error(message);
      setScreen({ name: "error", message, canRetry: true });
      return;
    }
    setScreen({ name: "confirm", plan, genreChoices, selectedTracks });
  }

  async function handleConfirm(genreChoices: GenreChoices, selectedTracks: string[]) {
    try {
      const { results } = await window.djApi.execute({ genreChoices, selectedTracks });
      setScreen({ name: "log", results });
    } catch (err) {
      const message = "Fehler beim Ausführen: " + (err as Error).message;
      toast.error(message);
      setScreen({ name: "error", message, canRetry: true });
    }
  }

  async function handleSaveSettings(newSettings: Settings) {
    try {
      await window.djApi.saveSettings(newSettings);
      toast.success("Einstellungen gespeichert");
    } catch (err) {
      toast.error("Fehler beim Speichern: " + (err as Error).message);
      return;
    }
    setSettingsOpen(false);
    await load();
  }

  if (crashed) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-destructive text-sm">
          Backend-Prozess abgestürzt. Bitte App neu starten.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {screen.name === "loading" && (
        <>
          <AppHeader title="Neue Tracks" />
          <TrackListSkeleton />
        </>
      )}

      {screen.name === "error" && (
        <>
          <AppHeader title="Neue Tracks">
            <Button variant="outline" onClick={syncNow}>
              Sync
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              Einstellungen
            </Button>
          </AppHeader>
          <ErrorView message={screen.message} onRetry={screen.canRetry ? load : undefined} />
        </>
      )}

      {screen.name === "trackList" && settings && scanResult && (
        <>
          <AppHeader
            title="Neue Tracks"
            badge={<Badge variant="secondary">{scanResult.tracks.length} Tracks</Badge>}
          >
            <Button variant="outline" onClick={syncNow}>
              Sync
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              Einstellungen
            </Button>
          </AppHeader>
          <TrackList
            tracks={scanResult.tracks}
            knownGenres={settings.known_genres}
            neuDirMissing={scanResult.neu_dir_missing}
            onSubmit={handleSubmit}
          />
        </>
      )}

      {screen.name === "confirm" && (
        <ConfirmDialog
          plan={screen.plan}
          onConfirm={() => handleConfirm(screen.genreChoices, screen.selectedTracks)}
          onCancel={() => setScreen({ name: "trackList" })}
        />
      )}

      {screen.name === "log" && <LogPanel results={screen.results} onRestart={load} />}

      {settings && (
        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          onOpenChange={setSettingsOpen}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}
