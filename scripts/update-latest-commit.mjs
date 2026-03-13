import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPaths = [
  path.join(repoRoot, "public", "latest-commit.json"),
  path.join(repoRoot, "generated", "latest-commit.json"),
];

const runGit = (args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const normaliseRepoUrl = (value) => {
  if (!value) {
    return null;
  }

  if (value.startsWith("git@github.com:")) {
    return `https://github.com/${value.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }

  if (value.startsWith("ssh://git@github.com/")) {
    return `https://github.com/${value.slice("ssh://git@github.com/".length).replace(/\.git$/, "")}`;
  }

  if (value.startsWith("https://github.com/")) {
    return value.replace(/\.git$/, "");
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "github.com") {
      return `https://github.com${parsed.pathname.replace(/\.git$/, "")}`;
    }
  } catch {
    // Fall through to null for unparseable remotes.
  }

  return null;
};

if (!existsSync(path.join(repoRoot, ".git"))) {
  process.exit(0);
}

let fullHash;

try {
  fullHash = runGit(["rev-parse", "HEAD"]);
} catch {
  process.exit(0);
}

const shortHash = runGit(["rev-parse", "--short", "HEAD"]);
const subject = runGit(["show", "-s", "--format=%s", "HEAD"]);
const committedAt = runGit(["show", "-s", "--format=%cI", "HEAD"]);
const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);

let repoUrl = null;

try {
  repoUrl = normaliseRepoUrl(runGit(["remote", "get-url", "origin"]));
} catch {
  repoUrl = null;
}

const payload = {
  branch,
  commitUrl: repoUrl ? `${repoUrl}/commit/${fullHash}` : null,
  committedAt,
  fullHash,
  repoUrl,
  shortHash,
  subject,
};

for (const outputPath of outputPaths) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}
