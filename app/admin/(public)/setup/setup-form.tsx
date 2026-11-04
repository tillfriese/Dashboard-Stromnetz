"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { passkeyErrorMessage } from "@/lib/auth/messages";

export function SetupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email") }),
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.status === 404 ? "Die Einrichtung ist bereits abgeschlossen." : ((await res.json()).error ?? "Fehler"));
      return;
    }
    const { token } = (await res.json()) as { token: string };

    // Register the first passkey; the account only becomes active if this succeeds.
    const result = await authClient.passkey.addPasskey({ name: "Erster Passkey", context: token, createSession: true });
    if (result?.error) {
      await fetch("/api/setup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setBusy(false);
      setError(`Passkey wurde nicht registriert: ${passkeyErrorMessage(result.error)} Der Account wurde nicht angelegt.`);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Der Admin-Account ist eingerichtet und du bist angemeldet.</Alert>
        <Alert tone="warning">
          <strong className="font-semibold">Lege jetzt einen zweiten Passkey an</strong>, z. B. auf einem anderen Gerät oder
          einem Sicherheitsschlüssel. Ohne zweiten Passkey sperrst du dich aus, wenn dieses Gerät verloren geht.
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/system#passkeys" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Zweiten Passkey hinzufügen
          </Link>
          <Link href="/admin/datenquellen" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Weiter zu den Datenquellen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field id="name" name="name" label="Name" autoComplete="name" required maxLength={100} disabled={busy} />
      <Field id="email" name="email" type="email" label="E-Mail" autoComplete="email" required maxLength={200} disabled={busy} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? "Warte auf Passkey …" : "Account anlegen und Passkey registrieren"}
      </Button>
    </form>
  );
}
