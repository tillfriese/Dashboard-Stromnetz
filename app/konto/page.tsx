import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PasskeysCard } from "@/components/account/passkeys-card";
import { SavedViewsCard } from "@/components/account/saved-views-card";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { Alert } from "@/components/ui/alert";
import { listPasskeys } from "@/lib/auth/passkeys";
import { hasPassword } from "@/lib/auth/registration";
import { getUserSession, isAdmin } from "@/lib/auth/session";
import { formatBerlin } from "@/lib/format";
import { listViews } from "@/lib/history/views";

export const metadata: Metadata = { title: "Mein Konto", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: PageProps<"/konto">) {
  const session = await getUserSession();
  if (!session) redirect("/anmelden?next=/konto");
  const sp = await searchParams;
  const admin = isAdmin(session);
  const [passkeys, password, views] = await Promise.all([
    listPasskeys(session.user.id),
    hasPassword(session.user.id),
    listViews(session.user.id),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-sm font-medium text-indigo-600">Konto</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Hallo, {session.user.name}</h1>
      </header>

      {sp.hinweis === "keine-admin-rechte" ? (
        <Alert tone="warning">Für den Admin-Bereich fehlen dir die Rechte. Ein Admin kann dich unter „Nutzer“ befördern.</Alert>
      ) : null}

      <section className="card p-6" aria-labelledby="profile-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 id="profile-title" className="font-semibold tracking-tight">
            Profil
          </h2>
          <div className="flex flex-wrap gap-2">
            {admin ? (
              <Link
                href="/admin"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Admin-Bereich
              </Link>
            ) : null}
            <div className="w-auto">
              <SignOutButton />
            </div>
          </div>
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
          <Item label="Name" value={session.user.name} />
          <Item label="E-Mail" value={session.user.email} />
          <Item label="Rolle" value={admin ? "Admin" : "Nutzer"} />
          <Item label="Mitglied seit" value={formatBerlin(new Date(session.user.createdAt).getTime(), "dd.MM.yyyy")} />
        </dl>
        <p className="mt-4 text-xs text-slate-500">Anmeldung per {[password ? "Passwort" : null, passkeys.length ? "Passkey" : null].filter(Boolean).join(" und ")}.</p>
      </section>

      <SavedViewsCard initial={views.map((v) => ({ id: v.id, name: v.name, params: v.params, createdAt: v.createdAt?.toISOString() ?? null }))} />
      <PasskeysCard initial={passkeys} hasPassword={password} />
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
