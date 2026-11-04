"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { authClient } from "@/lib/auth/client";
import { passkeyErrorMessage, SIGNUP_REFUSED } from "@/lib/auth/messages";

type Mode = "login" | "register";
const MODES = [
  { value: "login", label: "Anmelden" },
  { value: "register", label: "Registrieren" },
] as const;

export function AuthPanel({ next, initialMode }: { next: string; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <div className="space-y-6">
      <section className="card p-7" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Anmelden" : "Konto erstellen"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Mit einem Konto speicherst du deine Filter in der Historie.</p>
        <div className="mt-5">
          <Segmented label="Anmelden oder registrieren" value={mode} options={MODES} onChange={setMode} />
        </div>
        <div className="mt-6">{mode === "login" ? <LoginForm next={next} /> : <RegisterForm next={next} />}</div>
      </section>

      <section className="card p-7" aria-labelledby="guest-title">
        <h2 id="guest-title" className="font-semibold tracking-tight">
          Ohne Konto
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Als Gast siehst du alle Daten mit den Standardfiltern. Eigene Ansichten speichern kannst du nur mit Konto.
        </p>
        <Link
          href="/historie"
          className="mt-4 inline-flex rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Als Gast fortfahren
        </Link>
      </section>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-500" aria-hidden>
      <span className="h-px flex-1 bg-slate-200" />
      oder
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    router.replace(next);
    router.refresh();
  };

  // Conditional UI: offer passkeys in the browser's autofill when supported.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof PublicKeyCredential === "undefined" || !PublicKeyCredential.isConditionalMediationAvailable) return;
      if (!(await PublicKeyCredential.isConditionalMediationAvailable())) return;
      const res = await authClient.signIn.passkey({ autoFill: true });
      if (!cancelled && res && !res.error) {
        router.replace(next);
        router.refresh();
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return (
    <>
      <Button
        variant="primary"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await authClient.signIn.passkey({ autoFill: false });
          setBusy(false);
          if (res?.error) setError(passkeyErrorMessage(res.error));
          else done();
        }}
      >
        Mit Passkey anmelden
      </Button>
      <Divider />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          const res = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
          setBusy(false);
          if (res.error) setError(res.error.status === 429 ? "Zu viele Versuche. Bitte kurz warten." : "E-Mail oder Passwort ist falsch.");
          else done();
        }}
      >
        {/* "username webauthn" lets the browser also offer passkeys here (conditional UI). */}
        <Field id="login-email" name="email" type="email" label="E-Mail" autoComplete="username webauthn" required disabled={busy} />
        <Field id="login-password" name="password" type="password" label="Passwort" autoComplete="current-password" required disabled={busy} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Mit Passwort anmelden
        </Button>
      </form>
    </>
  );
}

function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const done = () => {
    router.replace(next);
    router.refresh();
  };
  const validBase = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  async function withPasskey() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/registrieren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Registrierung fehlgeschlagen.");
      return;
    }
    const reg = await authClient.passkey.addPasskey({ name: "Erster Passkey", context: body.token, createSession: true });
    if (reg?.error) {
      await fetch("/api/registrieren", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: body.token }) });
      setBusy(false);
      setError(`Passkey wurde nicht registriert: ${passkeyErrorMessage(reg.error)} Es wurde kein Konto angelegt.`);
      return;
    }
    done();
  }

  return (
    <div className="space-y-4">
      <Field id="reg-name" label="Name" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <Field id="reg-email" label="E-Mail" type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <Button variant="primary" className="w-full" disabled={busy || !validBase} onClick={withPasskey}>
        Mit Passkey registrieren
      </Button>
      <Divider />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const password = String(f.get("password"));
          if (password !== String(f.get("password2"))) {
            setError("Die Passwörter stimmen nicht überein.");
            return;
          }
          setBusy(true);
          setError(null);
          const res = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
          setBusy(false);
          if (res.error) {
            setError(
              res.error.status === 429
                ? "Zu viele Registrierungen. Bitte später erneut versuchen."
                : /exist/i.test(res.error.message ?? "") || res.error.status === 422
                  ? SIGNUP_REFUSED
                  : /password/i.test(res.error.message ?? "")
                    ? "Das Passwort muss mindestens 10 Zeichen lang sein."
                    : (res.error.message ?? "Registrierung fehlgeschlagen."),
            );
          } else done();
        }}
      >
        <Field id="reg-password" name="password" type="password" label="Passwort" autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy} hint="Mindestens 10 Zeichen." />
        <Field id="reg-password2" name="password2" type="password" label="Passwort wiederholen" autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" className="w-full" disabled={busy || !validBase}>
          Mit Passwort registrieren
        </Button>
      </form>
    </div>
  );
}
