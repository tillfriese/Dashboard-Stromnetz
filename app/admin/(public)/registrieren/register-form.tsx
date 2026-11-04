"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { passkeyErrorMessage } from "@/lib/auth/messages";

export function RegisterForm({ token, purpose }: { token: string; purpose: "invite" | "recovery" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setBusy(true);
    setError(null);
    const name = purpose === "invite" ? "Erster Passkey" : "Wiederhergestellt";
    const res = await authClient.passkey.addPasskey({ name, context: token, createSession: true });
    if (res?.error) {
      setBusy(false);
      setError(passkeyErrorMessage(res.error));
      return;
    }
    router.replace("/admin/system#passkeys");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Registriere einen Passkey auf diesem Gerät. Der Link ist danach verbraucht.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button variant="primary" className="w-full" onClick={register} disabled={busy}>
        {busy ? "Warte auf Passkey …" : "Passkey registrieren"}
      </Button>
    </div>
  );
}
