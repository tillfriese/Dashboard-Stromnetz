/**
 * Neutral answer when an address cannot be used for a new account (does not confirm that an
 * account exists; without a mail server this cannot be hidden completely, see README).
 */
export const SIGNUP_REFUSED = "Mit dieser E-Mail-Adresse ist keine Registrierung möglich. Hast du schon ein Konto? Dann melde dich an.";

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
