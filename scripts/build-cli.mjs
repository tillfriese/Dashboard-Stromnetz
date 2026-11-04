// Bundles the CLI scripts into self-contained ESM files (dist/cli) for the runtime image,
// which has neither tsx nor the TypeScript sources.
import { build } from "esbuild";

await build({
  entryPoints: {
    "admin-recovery": "scripts/admin-recovery.ts",
    migrate: "scripts/migrate.ts",
    backfill: "scripts/backfill.ts",
  },
  outdir: "dist/cli",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  external: ["pg-native"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
console.log("CLI built to dist/cli");
