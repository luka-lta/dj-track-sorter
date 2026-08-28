import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Settings } from "@/types/dj-api";

function FolderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (path: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <span className="truncate text-sm">
        {label}: {value}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const picked = await window.djApi.pickFolder();
          if (picked) onChange(picked);
        }}
      >
        Ändern
      </Button>
    </div>
  );
}

export function SettingsDialog({
  open,
  settings,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  settings: Settings;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: Settings) => void;
}) {
  const [state, setState] = useState<Settings>(settings);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setState(settings);
      setSyncError(null);
    }
  }, [open, settings]);

  async function syncGenres() {
    setSyncing(true);
    setSyncError(null);
    try {
      const { known_genres } = await window.djApi.syncGenres();
      setState((prev) => ({ ...prev, known_genres }));
    } catch (err) {
      setSyncError("Fehler beim Synchronisieren: " + (err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const genresText = syncError
    ? syncError
    : state.known_genres.length > 0
      ? `Genres: ${state.known_genres.join(", ")}`
      : "Genres: (noch nicht synchronisiert)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Einstellungen</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <FolderRow
            label="Neu-Ordner"
            value={state.neu_dir}
            onChange={(neu_dir) => setState((prev) => ({ ...prev, neu_dir }))}
          />
          <FolderRow
            label="DJ-Root"
            value={state.dj_root}
            onChange={(dj_root) => setState((prev) => ({ ...prev, dj_root }))}
          />
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <span className={syncError ? "text-destructive text-sm" : "text-sm"}>
              {genresText}
            </span>
            <Button variant="outline" size="sm" disabled={syncing} onClick={syncGenres}>
              Jetzt synchronisieren
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <Label htmlFor="dry-run" className="text-sm">
              DRY RUN (nichts schreiben, nur simulieren)
            </Label>
            <Switch
              id="dry-run"
              checked={state.dry_run}
              onCheckedChange={(checked) => setState((prev) => ({ ...prev, dry_run: checked }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave(state)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
