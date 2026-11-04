"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { passkeyErrorMessage } from "@/lib/auth/messages";
import { formatBerlin } from "@/lib/format";

type Row = { id: string; name: string; device: string; backedUp: boolean; createdAt: string | null; lastUsedAt: string | null };

export function PasskeysCard({ initial: rows, hasPassword = false }: { initial: Row[]; hasPassword?: boolean }) {
  const canDeleteLast = hasPassword;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function run(action: () => Promise<{ error?: { message?: string; code?: string; status?: number } | null } | undefined | null>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (res?.error) {
      setError(passkeyErrorMessage(res.error));
      return false;
    }
    router.refresh();
    return true;
  }

  const fmt = (iso: string | null) => (iso ? formatBerlin(Date.parse(iso)) : "–");

  return (
    <section id="passkeys" className="card p-6" aria-labelledby="passkeys-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="passkeys-title" className="font-semibold tracking-tight">
            Meine Passkeys
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {hasPassword
              ? "Mit einem Passkey meldest du dich ohne Passwort per Fingerabdruck, Gesicht oder Geräte-PIN an."
              : "Hinterlege mindestens zwei Passkeys auf verschiedenen Geräten, damit du dich nicht aussperrst."}
          </p>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => run(() => authClient.passkey.addPasskey({ name: `Passkey ${rows.length + 1}` }))}
        >
          Passkey hinzufügen
        </Button>
      </div>

      {rows.length < 2 && !hasPassword ? (
        <div className="mt-4">
          <Alert tone="warning">Du hast nur einen Passkey. Lege einen zweiten auf einem anderen Gerät oder Sicherheitsschlüssel an.</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {rows.length === 0 ? <p className="mt-5 text-sm text-slate-500">Noch keine Passkeys hinterlegt.</p> : null}
      <div className={`mt-5 overflow-x-auto ${rows.length === 0 ? "hidden" : ""}`} tabIndex={0} role="region" aria-label="Passkeys (scrollbar)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Gerät</th>
              <th className="py-2 pr-4 font-medium">Erstellt</th>
              <th className="py-2 pr-4 font-medium">Zuletzt benutzt</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4 font-medium">
                  {editing === p.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await run(() => authClient.passkey.updatePasskey({ id: p.id, name: newName.trim() }))) setEditing(null);
                      }}
                    >
                      <label htmlFor={`rename-${p.id}`} className="sr-only">
                        Neuer Name
                      </label>
                      <input
                        id={`rename-${p.id}`}
                        value={newName}
                        maxLength={60}
                        required
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      />
                      <Button type="submit" variant="primary" className="px-3 py-1" disabled={busy}>
                        OK
                      </Button>
                      <Button className="px-3 py-1" onClick={() => setEditing(null)}>
                        Abbrechen
                      </Button>
                    </form>
                  ) : (
                    p.name
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">{p.device}</td>
                <td className="py-3 pr-4 tabular-nums text-slate-600">{fmt(p.createdAt)}</td>
                <td className="py-3 pr-4 tabular-nums text-slate-600">{fmt(p.lastUsedAt)}</td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    className="px-2 py-1"
                    onClick={() => {
                      setEditing(p.id);
                      setNewName(p.name);
                    }}
                  >
                    Umbenennen
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-red-700"
                    disabled={busy || (rows.length <= 1 && !canDeleteLast)}
                    title={rows.length <= 1 && !canDeleteLast ? "Der letzte Passkey kann nicht gelöscht werden" : undefined}
                    onClick={() => {
                      if (confirm(`Passkey „${p.name}“ wirklich löschen?`)) run(() => authClient.passkey.deletePasskey({ id: p.id }));
                    }}
                  >
                    Löschen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
