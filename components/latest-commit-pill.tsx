"use client";

import { useEffect, useState } from "react";

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
  const [meta, setMeta] = useState<LatestCommitMeta | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLatestCommit = async () => {
      try {
        const response = await fetch(`/latest-commit.json?ts=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LatestCommitMeta;
        if (!cancelled) {
          setMeta(payload);
        }
      } catch {
        // Commit metadata is optional; hide the pill if it is unavailable.
      }
    };

    void loadLatestCommit();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!meta) {
    return null;
  }

  const commitDate = formatCommitDate(meta.committedAt);
  const content = (
    <>
      <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#9a968d]">
        Latest Commit
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-sm text-[#f3efe6]">{meta.shortHash}</span>
        {commitDate ? (
          <span className="text-[11px] text-[#9a968d]">{commitDate}</span>
        ) : null}
      </div>
      <div className="mt-1 max-w-[240px] truncate text-xs text-[#c4beb4]">
        {meta.subject}
      </div>
    </>
  );

  const className =
    "block rounded-2xl border border-white/10 bg-black/60 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:border-[#d0a15c]/50";

  if (!meta.commitUrl) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a
      href={meta.commitUrl}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={meta.fullHash}
    >
      {content}
    </a>
  );
}
