import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as authSchema from "@/lib/db/auth-schema";
import { authBaseURL } from "./base-url";
import { consumeToken, countPasskeys, hasActiveAccount, peekToken } from "./registration";

export { authBaseURL };

export const SESSION_IDLE_SECONDS = 12 * 60 * 60;


function createAuth() {
  const baseURL = authBaseURL();
  const secure = baseURL.protocol === "https:";

  return betterAuth({
    appName: "Netzlage",
    baseURL: baseURL.origin,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
        passkey: authSchema.passkey,
        rateLimit: authSchema.rateLimit,
      },
    }),

    // Passkeys only: no e-mail/password login, no sign-up.
    emailAndPassword: { enabled: false, disableSignUp: true },
    disabledPaths: ["/sign-up/email", "/sign-in/email", "/sign-in/anonymous"],

    // Sliding expiry: the session ends after 12 h without activity.
    session: {
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: 5 * 60,
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/passkey": { window: 60, max: 10 },
        "/passkey/generate-authenticate-options": { window: 60, max: 20 },
        "/passkey/verify-authentication": { window: 60, max: 10 },
        "/passkey/generate-register-options": { window: 60, max: 10 },
        "/passkey/verify-registration": { window: 60, max: 10 },
      },
    },

    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },

    databaseHooks: {
      user: {
        create: {
          // Accounts are only created by our own setup/invite code, never through Better Auth.
          before: async () => false,
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // The last remaining passkey of a user can never be deleted (lock-out protection).
        if (ctx.path === "/passkey/delete-passkey") {
          const session = ctx.context.session ?? (await auth().api.getSession({ headers: ctx.headers ?? new Headers() }));
          if (session && (await countPasskeys(session.user.id)) <= 1) {
            throw new APIError("BAD_REQUEST", { message: "Der letzte Passkey kann nicht gelöscht werden." });
          }
        }
      }),
    },

    plugins: [
      passkeyPlugin({
        rpID: baseURL.hostname,
        rpName: "Netzlage",
        origin: baseURL.origin,
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        registration: {
          // Passkey-first: without a session, a one-time registration ticket (setup,
          // invite, recovery) passed as `context` decides which account gets the passkey.
          requireSession: false,
          resolveUser: async ({ context }) => {
            const ticket = await peekToken(context);
            if (!ticket) throw new APIError("UNAUTHORIZED", { message: "Registrierungslink ungültig oder abgelaufen." });
            if (ticket.purpose === "setup" && (await hasActiveAccount())) {
              throw new APIError("NOT_FOUND", { message: "Not found" });
            }
            return { id: ticket.userId, name: ticket.email, displayName: ticket.name };
          },
          afterVerification: async ({ context, user }) => {
            if (!context) return; // signed-in user adding another passkey
            const ticket = await peekToken(context);
            if (ticket?.purpose === "setup" && (await hasActiveAccount())) {
              throw new APIError("NOT_FOUND", { message: "Not found" });
            }
            const consumed = await consumeToken(context);
            if (!consumed || consumed.userId !== user.id) {
              throw new APIError("UNAUTHORIZED", { message: "Registrierungslink ungültig oder abgelaufen." });
            }
            return { userId: consumed.userId };
          },
        },
        authentication: {
          afterVerification: async ({ clientData }) => {
            const credentialId = (clientData as { id?: unknown }).id;
            if (typeof credentialId === "string") {
              await db()
                .update(authSchema.passkey)
                .set({ lastUsedAt: sql`now()` })
                .where(eq(authSchema.passkey.credentialID, credentialId));
            }
          },
        },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { netzlageAuth?: Auth };

/** Lazily constructed so that `next build` does not need a database. */
export function auth(): Auth {
  g.netzlageAuth ??= createAuth();
  return g.netzlageAuth;
}
