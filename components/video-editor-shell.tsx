"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn, formatFileSize } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileVideo,
  Film,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  Upload,
} from "lucide-react";

type FormatOption = {
  value: string;
  label: string;
  description: string;
  pros: string;
  cons: string;
};

type EngineOption = {
  value: "browser" | "mediabunny";
  label: string;
  description: string;
};

type TargetSizeOption = {
  value: number;
  label: string;
};

type VideoEditorShellProps = {
  compressedSize: number | null;
  compressedVideo: string | null;
  compressionAttempt: number;
  currentQualityLevel: string;
  currentTime: number;
  encodeEngine: "browser" | "mediabunny";
  engineOptions: readonly EngineOption[];
  error: string | null;
  filmstripRef: React.RefObject<HTMLDivElement | null>;
  formatOptions: FormatOption[];
  formatTime: (timeInSeconds: number) => string;
  isCompressing: boolean;
  isGifInput: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  originalFileName: string;
  originalSize: number | null;
  outputFormat: string;
  playheadTime: number;
  progress: number;
  reductionPercent: number | null;
  selectionDuration: number;
  sourcePreview: string | null;
  targetSizeMB: number;
  targetSizeOptions: readonly TargetSizeOption[];
  thumbnails: string[];
  trimEnd: number;
  trimStart: number;
  videoDuration: number;
  videoObjectUrl: string | null;
  videoPreviewRef: React.RefObject<HTMLVideoElement | null>;
  onCompress: () => void;
  onDownload: () => void;
  onEncodeEngineChange: (value: "browser" | "mediabunny") => void;
  onFrameStep: (forward: boolean) => void;
  onOutputFormatChange: (value: string) => void;
  onReplaceSource: () => void;
  onResetCompressor: () => void;
  onResetTrim: () => void;
  onTargetSizeChange: (value: number) => void;
  onTimelinePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggleLoop: () => void;
  onTogglePlayPause: () => void;
  onTrimHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    edge: "start" | "end"
  ) => void;
  onVideoTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
};

export function VideoEditorShell({
  compressedSize,
  compressedVideo,
  compressionAttempt,
  currentQualityLevel,
  currentTime,
  encodeEngine,
  engineOptions,
  error,
  filmstripRef,
  formatOptions,
  formatTime,
  isCompressing,
  isGifInput,
  isLooping,
  isPlaying,
  originalFileName,
  originalSize,
  outputFormat,
  playheadTime,
  progress,
  reductionPercent,
  selectionDuration,
  sourcePreview,
  targetSizeMB,
  targetSizeOptions,
  thumbnails,
  trimEnd,
  trimStart,
  videoDuration,
  videoObjectUrl,
  videoPreviewRef,
  onCompress,
  onDownload,
  onEncodeEngineChange,
  onFrameStep,
  onOutputFormatChange,
  onReplaceSource,
  onResetCompressor,
  onResetTrim,
  onTargetSizeChange,
  onTimelinePointerDown,
  onToggleLoop,
  onTogglePlayPause,
  onTrimHandlePointerDown,
  onVideoTimeUpdate,
}: VideoEditorShellProps) {
  const trimStartPercent =
    videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0;
  const trimWidthPercent =
    videoDuration > 0 ? (selectionDuration / videoDuration) * 100 : 100;
  const trimEndPercent = Math.min(100, trimStartPercent + trimWidthPercent);
  const playheadPercent =
    videoDuration > 0 ? (playheadTime / videoDuration) * 100 : 0;
  const rulerTicks =
    videoDuration > 0
      ? Array.from({ length: 9 }, (_, index) => (videoDuration / 8) * index)
      : [];
  const compareExportVideoRef = useRef<HTMLVideoElement | null>(null);
  const [CompareSlider, setCompareSlider] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    let active = true;

    import("react-compare-slider")
      .then((module) => {
        if (active) {
          setCompareSlider(() => module.ReactCompareSlider);
        }
      })
      .catch((error) => {
        console.error("Failed to load compare slider:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const exportVideo = compareExportVideoRef.current;
    if (!compressedVideo || !exportVideo || isGifInput) {
      return;
    }

    if (
      exportVideo.readyState >= 1 &&
      Number.isFinite(exportVideo.duration) &&
      Math.abs(exportVideo.currentTime - currentTime) > 0.2
    ) {
      exportVideo.currentTime = currentTime;
    }
  }, [compressedVideo, currentTime, isGifInput]);

  useEffect(() => {
    const exportVideo = compareExportVideoRef.current;
    if (!compressedVideo || !exportVideo || isGifInput) {
      return;
    }

    if (isPlaying) {
      if (!exportVideo.currentSrc && !exportVideo.src) {
        return;
      }

      exportVideo.play().catch((error) => {
        if (
          error?.name !== "AbortError" &&
          error?.name !== "NotSupportedError"
        ) {
          console.error("Error playing exported video:", error);
        }
      });
      return;
    }

    exportVideo.pause();
  }, [compressedVideo, isGifInput, isPlaying]);

  const renderLivePreview = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <div>
          <div className="text-sm font-medium text-[#f3efe6]">
            {isGifInput ? "Preview" : "Real-time preview"}
          </div>
          <div className="text-xs text-[#9a968d]">
            {isGifInput
              ? "GIF conversion keeps the source intact and exports as video."
              : "Scrub or trim in the timeline and preview the selection instantly."}
          </div>
        </div>
        <div className="text-right text-xs text-[#9a968d]">
          <div>{formatFileSize(originalSize || 0)}</div>
          <div>{isGifInput ? "GIF asset" : formatTime(videoDuration)}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="flex h-full min-h-0 flex-col border border-[#2a2a2a] bg-[#101010]">
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <div className="relative flex h-full w-full items-center justify-center border border-[#252525] bg-[#0b0b0b]">
              {isGifInput ? (
                <img
                  src={videoObjectUrl || ""}
                  alt="GIF preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <>
                  <video
                    ref={videoPreviewRef}
                    src={videoObjectUrl || ""}
                    className="max-h-full max-w-full object-contain"
                    playsInline
                    onClick={onTogglePlayPause}
                    onTimeUpdate={onVideoTimeUpdate}
                  />
                  {!isPlaying && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex h-14 w-14 items-center justify-center border border-white/10 bg-black/60 text-white">
                        <Play className="ml-0.5 h-5 w-5" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {isGifInput ? (
            <div className="border-t border-[#2a2a2a] px-4 py-3 text-sm text-[#9a968d]">
              GIF sources use the Mediabunny export path. Timeline trimming and
              frame stepping stay available for video sources.
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2a2a2a] px-4 py-3">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onFrameStep(false)}
                  className="h-9 w-9 rounded-md border-[#353535] bg-[#171717] text-[#f3efe6] hover:bg-[#1f1f1f]"
                  title="Previous frame"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={onTogglePlayPause}
                  className="h-9 w-9 rounded-md bg-[#d0a15c] text-[#111111] hover:bg-[#ddb170]"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onFrameStep(true)}
                  className="h-9 w-9 rounded-md border-[#353535] bg-[#171717] text-[#f3efe6] hover:bg-[#1f1f1f]"
                  title="Next frame"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onToggleLoop}
                  className={cn(
                    "h-9 w-9 rounded-md text-[#c4beb4] hover:bg-[#1f1f1f]",
                    isLooping && "bg-[#221b12] text-[#d0a15c]"
                  )}
                  title={isLooping ? "Looping enabled" : "Looping disabled"}
                >
                  <Repeat className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={onResetTrim}
                  className="h-9 rounded-md px-3 text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6]"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset trim
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4 text-right text-xs text-[#9a968d]">
                <div>
                  <div>Playhead</div>
                  <div className="font-mono text-[#f3efe6]">
                    {formatTime(currentTime)}
                  </div>
                </div>
                <div>
                  <div>Selection</div>
                  <div className="font-mono text-[#f3efe6]">
                    {formatTime(selectionDuration)}
                  </div>
                </div>
                <div>
                  <div>Duration</div>
                  <div className="font-mono text-[#f3efe6]">
                    {formatTime(videoDuration)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPreviewPanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      {compressedVideo ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
            <div>
              <div className="text-sm font-medium text-[#f3efe6]">Compare export</div>
              <div className="text-xs text-[#9a968d]">
                Drag the divider to inspect the original clip against the exported result.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onTogglePlayPause}
                className="h-8 rounded-full border-[#3a3a3a] bg-[#171717] px-3 text-xs text-[#f3efe6] hover:bg-[#1f1f1f]"
                title={isPlaying ? "Pause compare preview" : "Play compare preview"}
              >
                {isPlaying ? (
                  <Pause className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Play className="mr-2 h-3.5 w-3.5" />
                )}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <div className="flex items-center gap-3 text-xs text-[#9a968d]">
                <span>Original</span>
                <span className="h-px w-6 bg-[#3a3a3a]" />
                <span>Export</span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-4">
            <div className="flex h-full min-h-0 flex-col border border-[#2a2a2a] bg-[#101010]">
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                <div className="relative h-full w-full border border-[#252525] bg-[#0b0b0b]">
                  {CompareSlider ? (
                    <CompareSlider
                      className="h-full w-full"
                      boundsPadding={0}
                      itemOne={
                        isGifInput ? (
                          <img
                            src={videoObjectUrl || ""}
                            alt="Original source"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <video
                            ref={videoPreviewRef}
                            src={videoObjectUrl || ""}
                            className="h-full w-full object-contain"
                            playsInline
                            muted
                            onClick={onTogglePlayPause}
                            onTimeUpdate={onVideoTimeUpdate}
                          />
                        )
                      }
                      itemTwo={
                        <video
                          ref={compareExportVideoRef}
                          src={compressedVideo}
                          className="h-full w-full object-contain"
                          playsInline
                          muted
                          onClick={onTogglePlayPause}
                        />
                      }
                      handle={
                        <div className="flex h-full w-8 items-center justify-center">
                          <div className="flex h-12 w-8 items-center justify-center border border-[#d0a15c] bg-[#171717] text-[#d0a15c]">
                            <div className="flex gap-1">
                              <span className="block h-4 w-px bg-current" />
                              <span className="block h-4 w-px bg-current" />
                            </div>
                          </div>
                        </div>
                      }
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#9a968d]">
                      Loading compare viewer
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-[#2a2a2a] bg-[#121212] text-xs text-[#9a968d]">
                <div className="border-r border-[#2a2a2a] px-4 py-2">
                  Original source
                </div>
                <div className="px-4 py-2 text-right">Compressed export</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        renderLivePreview()
      )}
    </section>
  );

  const renderMediaPanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <div>
          <div className="text-sm font-medium text-[#f3efe6]">Media</div>
          <div className="text-xs text-[#9a968d]">
            Source asset, trim, and export slots.
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={onReplaceSource}
          className="h-8 rounded-md px-3 text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6]"
        >
          <Upload className="mr-2 h-4 w-4" />
          Replace
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <div className="border border-[#2a2a2a] bg-[#101010]">
            <div className="flex aspect-video items-center justify-center border-b border-[#2a2a2a] bg-[#090909]">
              {sourcePreview ? (
                <img
                  src={sourcePreview}
                  alt="Source preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Film className="h-6 w-6 text-[#6f6a60]" />
              )}
            </div>
            <div className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#f3efe6]">
                    {originalFileName}
                  </div>
                  <div className="text-xs text-[#9a968d]">
                    {isGifInput ? "GIF asset" : "Video clip"}
                  </div>
                </div>
                <div className="text-xs text-[#c4beb4]">
                  {formatFileSize(originalSize || 0)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-[#9a968d]">
                <div>
                  <div>Type</div>
                  <div className="mt-1 text-[#f3efe6]">
                    {isGifInput ? "GIF" : "Video"}
                  </div>
                </div>
                <div>
                  <div>Duration</div>
                  <div className="mt-1 font-mono text-[#f3efe6]">
                    {videoDuration > 0 ? formatTime(videoDuration) : "--:--.--"}
                  </div>
                </div>
                <div>
                  <div>Trim start</div>
                  <div className="mt-1 font-mono text-[#f3efe6]">
                    {formatTime(trimStart)}
                  </div>
                </div>
                <div>
                  <div>Trim length</div>
                  <div className="mt-1 font-mono text-[#f3efe6]">
                    {formatTime(selectionDuration)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-[#2a2a2a] bg-[#101010]">
            <div className="border-b border-[#2a2a2a] px-3 py-2 text-sm font-medium text-[#f3efe6]">
              Asset stack
            </div>
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between border border-[#252525] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <FileVideo className="h-4 w-4 text-[#9a968d]" />
                  <div>
                    <div className="text-[#f3efe6]">Source</div>
                    <div className="text-xs text-[#9a968d]">Full clip</div>
                  </div>
                </div>
                <div className="text-xs text-[#c4beb4]">
                  {formatFileSize(originalSize || 0)}
                </div>
              </div>

              <div className="flex items-center justify-between border border-[#252525] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-[#9a968d]" />
                  <div>
                    <div className="text-[#f3efe6]">Selection</div>
                    <div className="text-xs text-[#9a968d]">Trimmed segment</div>
                  </div>
                </div>
                <div className="font-mono text-xs text-[#c4beb4]">
                  {formatTime(selectionDuration)}
                </div>
              </div>

              <div className="flex items-center justify-between border border-[#252525] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-[#9a968d]" />
                  <div>
                    <div className="text-[#f3efe6]">Export</div>
                    <div className="text-xs text-[#9a968d]">
                      {compressedVideo ? "Ready to download" : "Waiting on render"}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[#c4beb4]">
                  {compressedSize ? formatFileSize(compressedSize) : "--"}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={onReplaceSource}
              className="h-10 w-full rounded-md border-[#353535] bg-transparent text-[#f3efe6] hover:bg-[#1f1f1f]"
            >
              Choose another file
            </Button>
            <Button
              variant="ghost"
              onClick={onResetCompressor}
              className="h-10 w-full rounded-md text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6]"
            >
              Clear session
            </Button>
          </div>
        </div>
      </ScrollArea>
    </section>
  );

  const renderInspectorPanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <div className="border-b border-[#2a2a2a] px-4 py-3">
        <div className="text-sm font-medium text-[#f3efe6]">Inspector</div>
        <div className="text-xs text-[#9a968d]">
          Export settings for the current selection.
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          {error && (
            <Alert className="border-[#5a2929] bg-[#291717] text-[#f3d8d8]">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium text-[#f3efe6]">Compression</div>
            <div className="space-y-2">
              <label className="text-xs text-[#9a968d]">Engine</label>
              <Select
                value={encodeEngine}
                onValueChange={(value) =>
                  onEncodeEngineChange(value as "browser" | "mediabunny")
                }
                disabled={isGifInput}
              >
                <SelectTrigger className="h-10 rounded-md border-[#353535] bg-[#101010] text-[#f3efe6]">
                  <SelectValue placeholder="Select engine" />
                </SelectTrigger>
                <SelectContent className="border-[#353535] bg-[#101010] text-[#f3efe6]">
                  {engineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#9a968d]">Output format</label>
              <Select value={outputFormat} onValueChange={onOutputFormatChange}>
                <SelectTrigger className="h-10 rounded-md border-[#353535] bg-[#101010] text-[#f3efe6]">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent className="border-[#353535] bg-[#101010] text-[#f3efe6]">
                  {formatOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#9a968d]">Target file size</label>
              <Select
                value={targetSizeMB.toString()}
                onValueChange={(value) => onTargetSizeChange(Number(value))}
              >
                <SelectTrigger className="h-10 rounded-md border-[#353535] bg-[#101010] text-[#f3efe6]">
                  <SelectValue placeholder="Select target size" />
                </SelectTrigger>
                <SelectContent className="border-[#353535] bg-[#101010] text-[#f3efe6]">
                  {targetSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {encodeEngine === "mediabunny" && (
              <div className="border border-[#3a311f] bg-[#1c1811] px-3 py-2 text-xs text-[#d0a15c]">
                Mediabunny iterates quality to land as close as possible to the
                selected size target.
              </div>
            )}

            {isGifInput && (
              <div className="border border-[#4b3720] bg-[#20170d] px-3 py-2 text-xs text-[#d8a86a]">
                GIF input always exports through Mediabunny. Browser recorder and
                timeline trim remain video-only.
              </div>
            )}
          </div>

          <div className="border-t border-[#2a2a2a] pt-4">
            <div className="mb-3 text-sm font-medium text-[#f3efe6]">
              Current selection
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between text-[#9a968d]">
                <span>Source size</span>
                <span className="text-[#f3efe6]">
                  {formatFileSize(originalSize || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#9a968d]">
                <span>Trim range</span>
                <span className="font-mono text-[#f3efe6]">
                  {formatTime(trimStart)} - {formatTime(trimEnd)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#9a968d]">
                <span>Selection length</span>
                <span className="font-mono text-[#f3efe6]">
                  {formatTime(selectionDuration)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#9a968d]">
                <span>Export target</span>
                <span className="text-[#f3efe6]">{targetSizeMB} MB</span>
              </div>
            </div>
          </div>

          {isCompressing && (
            <div className="space-y-3 border-t border-[#2a2a2a] pt-4">
              <div className="flex items-center gap-2 text-sm text-[#f3efe6]">
                <Loader2 className="h-4 w-4 animate-spin text-[#d0a15c]" />
                Rendering export
              </div>
              <Progress value={progress} className="h-2 bg-[#101010]" />
              <div className="text-xs text-[#9a968d]">
                {compressionAttempt > 0 && currentQualityLevel
                  ? `Attempt ${compressionAttempt}/5 • ${currentQualityLevel} • ${progress}%`
                  : `Processing ${progress}%`}
              </div>
            </div>
          )}

          {compressedVideo && compressedSize && (
            <div className="space-y-3 border-t border-[#2a2a2a] pt-4">
              <div className="text-sm font-medium text-[#f3efe6]">
                Export result
              </div>
              <div className="border border-[#27402d] bg-[#132017] p-3">
                <div className="flex items-center justify-between text-sm text-[#9fc0a5]">
                  <span>Compressed file</span>
                  <span className="text-[#e4f1e6]">
                    {formatFileSize(compressedSize)}
                  </span>
                </div>
                {reductionPercent !== null && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-[#9fc0a5]">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {reductionPercent}% smaller than the source clip
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-[#2a2a2a] pt-4">
            <Button
              onClick={onCompress}
              disabled={isCompressing}
              className="h-10 w-full rounded-md bg-[#d0a15c] text-[#111111] hover:bg-[#ddb170]"
            >
              <Scissors className="mr-2 h-4 w-4" />
              {compressedVideo
                ? "Render new export"
                : isGifInput
                  ? "Export GIF"
                  : "Export clip"}
            </Button>

            {compressedVideo && (
              <Button
                variant="outline"
                onClick={onDownload}
                className="h-10 w-full rounded-md border-[#353535] bg-transparent text-[#f3efe6] hover:bg-[#1f1f1f]"
              >
                <Download className="mr-2 h-4 w-4" />
                Download export
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={onReplaceSource}
              className="h-10 w-full rounded-md text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6]"
            >
              Replace source
            </Button>
          </div>
        </div>
      </ScrollArea>
    </section>
  );

  const renderTimelinePanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <div>
          <div className="text-sm font-medium text-[#f3efe6]">Timeline</div>
          <div className="text-xs text-[#9a968d]">
            Multi-track trim and export view.
          </div>
        </div>
        {!isGifInput && (
          <div className="flex items-center gap-4 text-xs text-[#9a968d]">
            <span className="font-mono">{formatTime(trimStart)}</span>
            <span className="font-mono text-[#f3efe6]">
              {formatTime(selectionDuration)}
            </span>
            <span className="font-mono">{formatTime(trimEnd)}</span>
          </div>
        )}
      </div>

      {isGifInput ? (
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-[#9a968d]">
          GIF inputs skip the editor timeline. Export settings remain available in
          the inspector.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-w-[760px] min-h-full">
            <div className="w-24 shrink-0 border-r border-[#2a2a2a] bg-[#151515]">
              <div className="flex h-10 items-center border-b border-[#2a2a2a] px-3 text-xs text-[#9a968d]">
                Tracks
              </div>
              <div className="flex h-16 items-center border-b border-[#202020] px-3 text-sm text-[#f3efe6]">
                V1
              </div>
              <div className="flex h-14 items-center border-b border-[#202020] px-3 text-sm text-[#f3efe6]">
                Trim
              </div>
              <div className="flex h-14 items-center px-3 text-sm text-[#f3efe6]">
                Out
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="border-b border-[#2a2a2a] px-4 py-2">
                <div
                  className="relative h-6 cursor-pointer"
                  onPointerDown={onTimelinePointerDown}
                >
                  {rulerTicks.map((tick) => (
                    <div
                      key={tick}
                      className="absolute inset-y-0"
                      style={{
                        left: `${videoDuration > 0 ? (tick / videoDuration) * 100 : 0}%`,
                      }}
                    >
                      <div className="h-2 w-px bg-[#3a3a3a]" />
                      <div className="mt-1 -translate-x-1/2 text-[10px] font-mono text-[#7f7b72]">
                        {formatTime(tick)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 pt-3">
                <div
                  ref={filmstripRef}
                  className="relative space-y-2"
                  onPointerDown={onTimelinePointerDown}
                >
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[#f3efe6]"
                    style={{ left: `${playheadPercent}%` }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#d0a15c]"
                    style={{ left: `${trimStartPercent}%` }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#d0a15c]"
                    style={{ left: `${trimEndPercent}%` }}
                  />

                  <div className="relative h-16 overflow-hidden border border-[#2a2a2a] bg-[#101010]">
                    <div className="flex h-full">
                      {thumbnails.length > 0 ? (
                        thumbnails.map((src, index) => (
                          <img
                            key={index}
                            src={src}
                            alt="Timeline thumbnail"
                            className="h-full w-full flex-1 object-cover"
                            draggable={false}
                          />
                        ))
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[#7f7b72]">
                          Loading frames
                        </div>
                      )}
                    </div>
                    <div
                      className="absolute inset-y-0 left-0 bg-[#090909]/70"
                      style={{ width: `${trimStartPercent}%` }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 bg-[#090909]/70"
                      style={{ width: `${100 - trimEndPercent}%` }}
                    />
                  </div>

                  <div className="relative h-14 border border-[#2a2a2a] bg-[#101010]">
                    <div
                      className="absolute top-2 bottom-2 border border-[#d0a15c] bg-[#221b12]"
                      style={{
                        left: `${trimStartPercent}%`,
                        width: `${trimWidthPercent}%`,
                      }}
                    >
                      <div className="flex h-full items-center justify-between px-3 text-xs text-[#f3efe6]">
                        <span>Trimmed selection</span>
                        <span className="font-mono">
                          {formatTime(selectionDuration)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="relative h-14 border border-[#2a2a2a] bg-[#101010]">
                    <div
                      className={cn(
                        "absolute top-2 bottom-2 border px-3",
                        compressedVideo
                          ? "border-[#27402d] bg-[#132017]"
                          : "border-dashed border-[#3d3425] bg-[#16120c]"
                      )}
                      style={{ left: 0, width: `${trimWidthPercent}%` }}
                    >
                      <div className="flex h-full items-center justify-between text-xs">
                        <span
                          className={
                            compressedVideo ? "text-[#b7d5bd]" : "text-[#c9b692]"
                          }
                        >
                          {compressedVideo ? "Compressed output" : "Export target"}
                        </span>
                        <span
                          className={cn(
                            "font-mono",
                            compressedVideo ? "text-[#e4f1e6]" : "text-[#d0a15c]"
                          )}
                        >
                          {compressedSize
                            ? formatFileSize(compressedSize)
                            : `${targetSizeMB} MB`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="absolute top-0 bottom-0 z-30 w-4 -translate-x-1/2 cursor-ew-resize"
                    style={{ left: `${trimStartPercent}%` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onTrimHandlePointerDown(event, "start");
                    }}
                  >
                    <div className="mx-auto h-full w-px bg-[#d0a15c]" />
                    <div className="absolute top-0 left-1/2 h-4 w-4 -translate-x-1/2 border border-[#d0a15c] bg-[#171717]" />
                  </div>

                  <div
                    className="absolute top-0 bottom-0 z-30 w-4 -translate-x-1/2 cursor-ew-resize"
                    style={{ left: `${trimEndPercent}%` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onTrimHandlePointerDown(event, "end");
                    }}
                  >
                    <div className="mx-auto h-full w-px bg-[#d0a15c]" />
                    <div className="absolute top-0 left-1/2 h-4 w-4 -translate-x-1/2 border border-[#d0a15c] bg-[#171717]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-[#2a2a2a] bg-[#151515] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-[#2a2a2a] bg-[#101010] text-[#d0a15c]">
            <Film className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#f3efe6]">
              Video Compressor
            </div>
            <div className="truncate text-xs text-[#9a968d]">{originalFileName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onReplaceSource}
            className="hidden rounded-md px-3 text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6] sm:flex"
          >
            <Upload className="mr-2 h-4 w-4" />
            Replace
          </Button>
          <Button
            onClick={compressedVideo ? onDownload : onCompress}
            disabled={isCompressing}
            className="rounded-md bg-[#d0a15c] text-[#111111] hover:bg-[#ddb170]"
          >
            {isCompressing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : compressedVideo ? (
              <Download className="mr-2 h-4 w-4" />
            ) : (
              <Scissors className="mr-2 h-4 w-4" />
            )}
            {compressedVideo ? "Download export" : "Export"}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 xl:hidden">
        <ScrollArea className="h-full">
          <div className="space-y-px bg-[#2a2a2a]">
            <div className="bg-[#171717]">{renderPreviewPanel()}</div>
            <div className="bg-[#171717]">{renderTimelinePanel()}</div>
            <div className="bg-[#171717]">{renderMediaPanel()}</div>
            <div className="bg-[#171717]">{renderInspectorPanel()}</div>
          </div>
        </ScrollArea>
      </div>

      <div className="hidden min-h-0 flex-1 xl:block">
        <ResizablePanelGroup direction="vertical" className="h-full bg-[#2a2a2a]">
          <ResizablePanel defaultSize={72} minSize={36} className="min-h-0">
            <ResizablePanelGroup direction="horizontal" className="h-full bg-[#2a2a2a]">
              <ResizablePanel
                defaultSize={18}
                minSize={14}
                maxSize={26}
                className="min-w-0 bg-[#171717]"
              >
                {renderMediaPanel()}
              </ResizablePanel>
              <ResizableHandle className="bg-[#2a2a2a]" />
              <ResizablePanel
                defaultSize={56}
                minSize={38}
                className="min-w-0 bg-[#171717]"
              >
                {renderPreviewPanel()}
              </ResizablePanel>
              <ResizableHandle className="bg-[#2a2a2a]" />
              <ResizablePanel
                defaultSize={26}
                minSize={18}
                maxSize={34}
                className="min-w-0 bg-[#171717]"
              >
                {renderInspectorPanel()}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle className="bg-[#2a2a2a]" />
          <ResizablePanel defaultSize={28} minSize={18} className="min-h-0 bg-[#171717]">
            {renderTimelinePanel()}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
