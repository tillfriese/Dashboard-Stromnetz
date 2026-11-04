import { z } from "zod";

/**
 * Server-side environment. Parsed lazily so that `next build` works without a
 * database or secrets being present.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  PUBLIC_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  ENTSOE_API_TOKEN: z.string().optional(),
  GRIDRADAR_API_TOKEN: z.string().optional(),
  STROMGEDACHT_ZIP: z.string().regex(/^\d{5}$/).default("70173"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
