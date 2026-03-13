import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runGit = (args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

if (!existsSync(path.join(repoRoot, ".git"))) {
  process.exit(0);
}

try {
  const currentHooksPath = runGit(["config", "--get", "core.hooksPath"]);
  if (currentHooksPath === ".githooks") {
    process.exit(0);
  }
} catch {
  // Missing config is fine; set it below.
}

try {
  runGit(["config", "core.hooksPath", ".githooks"]);
  console.log("Configured git hooks path: .githooks");
} catch {
  process.exit(0);
}
