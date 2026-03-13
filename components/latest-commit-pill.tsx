import latestCommitMeta from "@/generated/latest-commit.json";
import { ExternalLink } from "lucide-react";

type LatestCommitMeta = {
  branch: string;
  commitUrl: string | null;
  committedAt: string;
  fullHash: string;
  repoUrl: string | null;
  shortHash: string;
  subject: string;
};

const formatCommitDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(parsed);
};

export function LatestCommitPill() {
  const meta = latestCommitMeta as LatestCommitMeta | null;

  if (!meta || !meta.shortHash) {
    return null;
  }

  const commitDate = formatCommitDate(meta.committedAt);
  const content = (
    <div className="flex min-w-0 items-center gap-3 text-sm text-[#f3efe6]">
      <span className="shrink-0 text-[#9a968d]">Latest commit</span>
      <span className="shrink-0 font-mono">{meta.shortHash}</span>
      {commitDate ? <span className="shrink-0 text-[#7f7b72]">{commitDate}</span> : null}
      <span className="min-w-0 flex-1 truncate text-[#c4beb4]">{meta.subject}</span>
      {meta.commitUrl ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[#9a968d]">
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="shrink-0 text-xs text-[#7f7b72]">Link unavailable</span>
      )}
    </div>
  );

  if (meta.commitUrl) {
    return (
      <a
        href={meta.commitUrl}
        target="_blank"
        rel="noreferrer"
        className="block border border-[#2a2a2a] bg-[#111111] px-4 py-3 transition-colors hover:border-[#3d3427]"
        title={meta.fullHash}
      >
        {content}
      </a>
    );
  }

  return (
    <div className="border border-[#2a2a2a] bg-[#111111] px-4 py-3">
      {content}
    </div>
  );
}
