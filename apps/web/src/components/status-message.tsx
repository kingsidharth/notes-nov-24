import type { ReactNode } from "react";

interface StatusMessageProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}

/** Centered icon + title + body for empty, not-found and error states. */
export function StatusMessage({ icon, title, children }: StatusMessageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground [&>svg]:size-10 [&>svg]:text-muted-foreground/50">
      {icon}
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {children}
    </div>
  );
}
