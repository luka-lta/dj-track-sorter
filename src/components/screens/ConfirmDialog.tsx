import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import type { PlanItem } from "@/types/dj-api";

export function ConfirmDialog({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: PlanItem[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <AppHeader title="Vorschau" />
      <div className="flex flex-col gap-2 mb-4">
        {plan.map((item) => (
          <div
            key={item.track_name}
            className="rounded-lg border border-border bg-card p-3"
          >
            {item.warnings.length > 0 ? (
              <span className="text-destructive text-sm">
                {item.track_name} — übersprungen: {item.warnings.join(" ")}
              </span>
            ) : (
              <span>
                {item.track_name} → {item.target_path}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={onConfirm}>Ausführen</Button>
        <Button variant="outline" onClick={onCancel}>
          Zurück
        </Button>
      </div>
    </div>
  );
}
