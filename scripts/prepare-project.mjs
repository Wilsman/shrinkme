import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runNodeScript = (scriptName) => {
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", scriptName)], {
    cwd: repoRoot,
    stdio: "inherit",
  });
};

runNodeScript("setup-git-hooks.mjs");
runNodeScript("update-latest-commit.mjs");
