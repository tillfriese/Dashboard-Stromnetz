import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as authSchema from "@/lib/db/auth-schema";
import { authBaseURL } from "./base-url";
import { consumeToken, countPasskeys, hasActiveAccount, hasPassword, peekToken } from "./registration";

export { authBaseURL };

export const MAX_NAME_LENGTH = 100;

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

    // Everyone can create an account: with a passkey (our own signup ticket, see registration.ts)
    // or classically with e-mail and password. There is no mail server, so addresses are not
    // verified – accounts only grant saving private views; admin rights are given by admins.
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    disabledPaths: ["/sign-in/anonymous", "/change-email", "/request-password-reset", "/reset-password"],

    user: {
      additionalFields: {
        // Never settable by clients; changed only by admins through /api/admin/users.
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },

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
        "/sign-up/email": { window: 600, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
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
          // Self-service sign-ups are always normal users.
          before: async (user) => ({ data: { ...user, role: "user" } }),
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Names come from the sign-up form (max. 100 characters there); enforce the same limit for
        // direct API calls, so the admin list and the header cannot be flooded.
        if (ctx.path === "/sign-up/email" || ctx.path === "/update-user") {
          const name = (ctx.body as { name?: unknown } | undefined)?.name;
          if (name !== undefined && (typeof name !== "string" || name.trim().length < 1 || name.trim().length > MAX_NAME_LENGTH)) {
            throw new APIError("BAD_REQUEST", { message: `Name muss 1 bis ${MAX_NAME_LENGTH} Zeichen lang sein.` });
          }
        }
        // The last passkey of an account without password can never be deleted (lock-out protection).
        if (ctx.path === "/passkey/delete-passkey") {
          const session = ctx.context.session ?? (await auth().api.getSession({ headers: ctx.headers ?? new Headers() }));
          if (session && (await countPasskeys(session.user.id)) <= 1 && !(await hasPassword(session.user.id))) {
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
          // Passkey-first: without a session, a one-time registration ticket (setup, invite,
          // recovery, self-service signup) passed as `context` decides which account gets it.
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
