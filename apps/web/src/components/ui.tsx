import type { ReactNode } from 'react';

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-muted" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-4 border-line border-t-brand" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold leading-tight">{children}</h1>;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-danger" role="alert">
      {children}
    </p>
  );
}
