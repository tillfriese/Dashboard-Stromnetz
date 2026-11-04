import type { ReactNode } from "react";

export function AdminPageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-8">
      <p className="text-sm font-medium text-indigo-600">Admin</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-2 text-slate-500">{description}</p> : null}
    </header>
  );
}
