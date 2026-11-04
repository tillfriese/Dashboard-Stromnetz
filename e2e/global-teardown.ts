import { psql } from "./helpers";

/** Removes the test accounts again so the real first-run setup is still available. */
export default async function globalTeardown() {
  psql(`TRUNCATE "user", session, account, verification, passkey, registration_tokens, rate_limit, settings CASCADE`);
}
