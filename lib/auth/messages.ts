/** Maps WebAuthn/Better Auth errors to short German messages. */
export function passkeyErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return "Unbekannter Fehler.";
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/NotAllowedError|cancel|abort|timed out/i.test(text)) return "Der Vorgang wurde abgebrochen oder ist abgelaufen.";
  if (/InvalidStateError|already registered|previously registered/i.test(text)) {
    return "Auf diesem Gerät ist bereits ein Passkey registriert. Nutze ein anderes Gerät oder einen Sicherheitsschlüssel.";
  }
  if (/UNAUTHORIZED|ungültig oder abgelaufen/i.test(text)) return "Der Link ist ungültig oder abgelaufen.";
  if (error.status === 429) return "Zu viele Versuche. Bitte kurz warten.";
  return error.message || "Unbekannter Fehler.";
}
