import type { ReactNode } from "react";

export function AppHeader({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        {badge}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </header>
  );
}
