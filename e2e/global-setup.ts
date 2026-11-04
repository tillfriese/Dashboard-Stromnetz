import { psql } from "./helpers";

/** Resets auth state and settings so the first-run setup can be tested. */
export default async function globalSetup() {
  psql(`TRUNCATE "user", session, account, verification, passkey, registration_tokens, rate_limit, settings CASCADE`);
}
