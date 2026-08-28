import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import type { ExecuteResult } from "@/types/dj-api";

export function LogPanel({
  results,
  onRestart,
}: {
  results: ExecuteResult[];
  onRestart: () => void;
}) {
  return (
    <div>
      <AppHeader title="Ergebnis" />
      <div className="mb-4 font-mono text-sm">
        {results.map((result) => (
          <div key={result.track_name} className="py-0.5">
            {result.track_name}: {result.status}
          </div>
        ))}
      </div>
      <Button onClick={onRestart}>Neu scannen</Button>
    </div>
  );
}
