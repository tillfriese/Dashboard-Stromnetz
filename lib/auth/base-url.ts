/** Public URL of the app; determines the passkey relying party (rpID + origin). */
export function authBaseURL(): URL {
  return new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
}
