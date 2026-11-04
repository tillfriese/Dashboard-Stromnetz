// Emergency access: prints a one-time link (valid 15 min) to register a new passkey.
// Usage: docker compose exec app npm run admin:recovery -- <email>
import { authBaseURL } from "../lib/auth/base-url";
import { createRecovery, RegistrationError } from "../lib/auth/registration";
import { pool } from "../lib/db";

const email = process.argv[2];
if (!email) {
  console.error("Aufruf: npm run admin:recovery -- <email>");
  process.exit(2);
}

try {
  const { token, expiresAt } = await createRecovery(email);
  const link = new URL(`/admin/registrieren?token=${token}`, authBaseURL()).toString();
  console.log(`\nWiederherstellungslink für ${email} (einmalig, gültig bis ${expiresAt.toISOString()}):\n\n  ${link}\n`);
} catch (err) {
  console.error(err instanceof RegistrationError ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool().end();
}
