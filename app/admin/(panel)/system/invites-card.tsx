"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatBerlin } from "@/lib/format";

type Invite = { userId: string; name: string; email: string; expiresAt: string };

export function InvitesCard({ initial }: { initial: Invite[] }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    setLink(null);
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email") }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Fehler");
      return;
    }
    setLink(json.link);
    formEl.reset();
    router.refresh();
  }

  async function revoke(userId: string) {
    await fetch(`/api/admin/invites?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="card p-6" aria-labelledby="invites-title">
      <h2 id="invites-title" className="font-semibold tracking-tight">
        Weitere Admins einladen
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Erzeugt einen einmaligen Link (24 h gültig), über den die eingeladene Person ihren Passkey registriert. Eine offene
        Registrierung gibt es nicht.
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field id="invite-name" name="name" label="Name" required maxLength={100} />
        <Field id="invite-email" name="email" type="email" label="E-Mail" required maxLength={200} />
        <Button type="submit" variant="primary" disabled={busy}>
          Link erzeugen
        </Button>
      </form>
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {link ? (
        <div className="mt-4 space-y-2">
          <Alert tone="success">Einladungslink erzeugt. Er wird nur jetzt angezeigt.</Alert>
          <div className="flex gap-2">
            <label htmlFor="invite-link" className="sr-only">
              Einladungslink
            </label>
            <input id="invite-link" readOnly value={link} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs" />
            <Button onClick={() => navigator.clipboard.writeText(link)}>Kopieren</Button>
          </div>
        </div>
      ) : null}

      {initial.length > 0 ? (
        <ul className="mt-5 divide-y divide-slate-100 text-sm">
          {initial.map((i) => (
            <li key={i.userId} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="font-medium">{i.name}</span> <span className="text-slate-500">({i.email})</span>
                <span className="block text-xs text-slate-500">gültig bis {formatBerlin(Date.parse(i.expiresAt))}</span>
              </span>
              <Button variant="danger" className="px-3 py-1" onClick={() => revoke(i.userId)}>
                Widerrufen
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
