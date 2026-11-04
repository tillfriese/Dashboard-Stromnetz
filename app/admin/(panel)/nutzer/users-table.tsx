"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Role, UserRow } from "@/lib/admin/users";
import { formatBerlin } from "@/lib/format";

export function UsersTable({ initial, selfId }: { initial: UserRow[]; selfId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const admins = rows.filter((r) => r.role === "admin").length;

  async function call(id: string, init: RequestInit & { url: string }) {
    setBusy(id);
    setMsg(null);
    const res = await fetch(init.url, { ...init, headers: { "Content-Type": "application/json" } });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMsg({ tone: "error", text: body.error ?? "Aktion fehlgeschlagen." });
      return false;
    }
    return true;
  }

  async function changeRole(u: UserRow, role: Role) {
    const verb = role === "admin" ? "zum Admin befördern" : "die Admin-Rechte entziehen";
    if (!confirm(`${u.name} ${verb}?`)) return;
    if (await call(u.id, { url: "/api/admin/users", method: "PATCH", body: JSON.stringify({ id: u.id, role }) })) {
      setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, role } : r)));
      setMsg({ tone: "success", text: role === "admin" ? `${u.name} ist jetzt Admin.` : `${u.name} ist jetzt Nutzer.` });
      router.refresh();
    }
  }

  async function remove(u: UserRow) {
    if (!confirm(`Konto von ${u.name} (${u.email}) samt gespeicherter Ansichten endgültig löschen?`)) return;
    if (await call(u.id, { url: `/api/admin/users?id=${encodeURIComponent(u.id)}`, method: "DELETE" })) {
      setRows((rs) => rs.filter((r) => r.id !== u.id));
      setMsg({ tone: "success", text: `Konto von ${u.name} gelöscht.` });
    }
  }

  const fmt = (iso: string | null) => (iso ? formatBerlin(Date.parse(iso), "dd.MM.yyyy") : "–");

  return (
    <section className="card p-6" aria-labelledby="users-title">
      <h2 id="users-title" className="font-semibold tracking-tight">
        {rows.length} {rows.length === 1 ? "Konto" : "Konten"} · {admins} {admins === 1 ? "Admin" : "Admins"}
      </h2>
      {msg ? (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      <div className="mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Nutzer (scrollbar)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Rolle</th>
              <th className="py-2 pr-4 font-medium">Anmeldung</th>
              <th className="py-2 pr-4 text-right font-medium">Ansichten</th>
              <th className="py-2 pr-4 font-medium">Registriert</th>
              <th className="py-2 pr-4 font-medium">Zuletzt aktiv</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const self = u.id === selfId;
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-64 py-3 pr-4">
                    <p className="truncate font-medium">
                      {u.name}
                      {self ? <span className="ml-1.5 text-xs font-normal text-slate-500">(du)</span> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {u.role === "admin" ? "Admin" : "Nutzer"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {[u.passkeys ? `${u.passkeys} Passkey${u.passkeys > 1 ? "s" : ""}` : null, u.hasPassword ? "Passwort" : null].filter(Boolean).join(", ")}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{u.views}</td>
                  <td className="py-3 pr-4 tabular-nums text-slate-600">{fmt(u.createdAt)}</td>
                  <td className="py-3 pr-4 tabular-nums text-slate-600">{fmt(u.lastSeenAt)}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {u.role === "admin" ? (
                      <Button
                        variant="ghost"
                        className="px-2 py-1"
                        disabled={busy != null || self || admins <= 1}
                        title={self ? "Eigene Rechte kann nur ein anderer Admin entziehen" : admins <= 1 ? "Es muss mindestens ein Admin bleiben" : undefined}
                        onClick={() => changeRole(u, "user")}
                      >
                        Zum Nutzer machen
                      </Button>
                    ) : (
                      <Button variant="ghost" className="px-2 py-1 text-indigo-700" disabled={busy != null} onClick={() => changeRole(u, "admin")}>
                        Zum Admin befördern
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-red-700"
                      disabled={busy != null || self}
                      title={self ? "Das eigene Konto kann hier nicht gelöscht werden" : undefined}
                      onClick={() => remove(u)}
                    >
                      Löschen
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
