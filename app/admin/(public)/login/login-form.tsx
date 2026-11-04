"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { passkeyErrorMessage } from "@/lib/auth/messages";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conditional UI: offer passkeys in the browser's autofill when supported.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof PublicKeyCredential === "undefined" || !PublicKeyCredential.isConditionalMediationAvailable) return;
      if (!(await PublicKeyCredential.isConditionalMediationAvailable())) return;
      const res = await authClient.signIn.passkey({ autoFill: true });
      if (!cancelled && res && !res.error) router.replace(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function signIn() {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.passkey({ autoFill: false });
    if (res?.error) {
      setBusy(false);
      setError(passkeyErrorMessage(res.error));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Hidden-ish username field so the browser can offer passkeys via autofill. */}
      <label htmlFor="username" className="sr-only">
        Passkey auswählen
      </label>
      <input
        id="username"
        name="username"
        autoComplete="username webauthn"
        placeholder="Passkey auswählen"
        className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400"
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button variant="primary" className="w-full" onClick={signIn} disabled={busy}>
        {busy ? "Warte auf Passkey …" : "Mit Passkey anmelden"}
      </Button>
    </div>
  );
}
