import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children ? <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div> : null}
    </section>
  );
}
