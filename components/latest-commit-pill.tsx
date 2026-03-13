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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#f3efe6]">
          <span className="text-[#9a968d]">Latest commit</span>
          <span className="font-mono">{meta.shortHash}</span>
          {commitDate ? <span className="text-[#7f7b72]">{commitDate}</span> : null}
        </div>
        <div className="mt-1 truncate text-sm text-[#c4beb4]">{meta.subject}</div>
      </div>

      {meta.commitUrl ? (
        <span className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-[#353535] px-3 text-sm text-[#f3efe6] transition-colors hover:border-[#d0a15c] hover:text-[#d0a15c]">
          <span>View commit</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="text-xs text-[#7f7b72]">Link unavailable</span>
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
