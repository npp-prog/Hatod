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

/** Big, accessible on/off switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line'}`}
    >
      <span className={`inline-block size-7 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-8' : 'translate-x-1'}`} />
    </button>
  );
}
