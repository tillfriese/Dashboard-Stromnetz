import type { ReactNode } from "react";

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="card p-7">
        <p className="section-label">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-2 text-sm text-slate-500">{description}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
