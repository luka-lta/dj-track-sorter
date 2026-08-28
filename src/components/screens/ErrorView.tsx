import { Button } from "@/components/ui/button";

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-destructive text-sm">{message}</p>
      {onRetry && (
        <div>
          <Button onClick={onRetry}>Erneut versuchen</Button>
        </div>
      )}
    </div>
  );
}
