"use client";

import type React from "react";
import { LatestCommitPill } from "@/components/latest-commit-pill";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Upload, Zap } from "lucide-react";

type UploadSurfaceProps = {
  error: string | null;
  isDragging: boolean;
  isReady: boolean;
  onBrowse: () => void;
  onFileDrop: (file: File) => void;
  onDraggingChange: (value: boolean) => void;
};

export function UploadSurface({
  error,
  isDragging,
  isReady,
  onBrowse,
  onFileDrop,
  onDraggingChange,
}: UploadSurfaceProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        {error && (
          <Alert className="mb-4 border-[#5a2929] bg-[#291717] text-[#f3d8d8]">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div
          className={cn(
            "border border-dashed border-[#343434] bg-[#141414] px-10 py-12 text-center transition-colors",
            isDragging && "border-[#d0a15c] bg-[#1a1713]"
          )}
          onDragOver={(event) => {
            event.preventDefault();
            onDraggingChange(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            onDraggingChange(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDraggingChange(false);
            if (event.dataTransfer.files?.[0]) {
              onFileDrop(event.dataTransfer.files[0]);
            }
          }}
        >
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center border border-[#2a2a2a] bg-[#101010] text-[#d0a15c]">
            <Upload className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-semibold text-[#f3efe6]">
            Drop your media here
          </h1>
          <p className="mt-3 text-sm text-[#9a968d]">
            MP4, MOV, AVI, and GIF files supported.
          </p>
          <div className="mt-8">
            <Button
              onClick={onBrowse}
              disabled={!isReady}
              className="h-11 rounded-md bg-[#d0a15c] px-6 text-[#111111] hover:bg-[#ddb170]"
            >
              <Upload className="mr-2 h-4 w-4" />
              Select file
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-[#7f7b72]">
            <span className="inline-flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Clean upload flow
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              Fast local processing
            </span>
          </div>
        </div>

        <div className="mt-3">
          <LatestCommitPill />
        </div>
      </div>
    </div>
  );
}
