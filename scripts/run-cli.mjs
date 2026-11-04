// Runs a CLI script: the bundled version in dist/cli if present (container),
// otherwise the TypeScript source via tsx (development).
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [name, ...args] = process.argv.slice(2);
const bundled = path.resolve("dist/cli", `${name}.mjs`);
if (existsSync(bundled)) {
  process.argv = [process.argv[0], bundled, ...args];
  await import(pathToFileURL(bundled).href);
} else {
  const r = spawnSync("npx", ["tsx", `scripts/${name}.ts`, ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
