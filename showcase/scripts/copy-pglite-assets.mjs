import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceDir = join(root, "node_modules", "@electric-sql", "pglite", "dist");
const outputDir = join(
  root,
  ".vercel",
  "output",
  "functions",
  "__server.func",
  "_libs",
);

if (!existsSync(outputDir)) {
  throw new Error(`Vercel server output not found: ${outputDir}`);
}

mkdirSync(outputDir, { recursive: true });
for (const filename of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  copyFileSync(join(sourceDir, filename), join(outputDir, filename));
}

console.log("[build] Copied PGLite runtime assets into the Vercel function.");
