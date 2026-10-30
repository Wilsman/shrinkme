// Copies the gifsicle WASM build into public/ so the GIF worker can load it.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "node_modules", "gifsicle-wasm", "dist");
const targetDir = path.join(repoRoot, "public", "vendor", "gifsicle");

mkdirSync(targetDir, { recursive: true });
for (const file of ["gifsicle.js", "gifsicle.wasm"]) {
  copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}
