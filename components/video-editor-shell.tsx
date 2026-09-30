"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { LatestCommitPill } from "@/components/latest-commit-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn, formatFileSize } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeftToLine,
  ArrowRightToLine,
  CheckCircle,
  Download,
  Film,
  FolderOpen,
  Keyboard,
  Loader2,
  Maximize,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
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
  hasMedia: boolean;
  isCompressing: boolean;
  isGifInput: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  isReady: boolean;
  originalFileName: string | null;
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
  onFileDrop: (file: File) => void;
  onFrameStep: (forward: boolean) => void;
  onOutputFormatChange: (value: string) => void;
  onReplaceSource: () => void;
  onResetCompressor: () => void;
  onResetTrim: () => void;
  onSeek: (time: number) => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onTargetSizeChange: (value: number) => void;
  onTimelinePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggleLoop: () => void;
  onTogglePlayPause: () => void;
  onTrimHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    edge: "start" | "end",
  ) => void;
  onVideoTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
};

const RULER_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

const SHORTCUTS = [
  { keys: ["Space"], label: "Play / pause" },
  { keys: ["←", "→"], label: "Step one frame" },
  { keys: ["Shift", "←/→"], label: "Jump one second" },
  { keys: ["Home", "End"], label: "Go to in / out point" },
  { keys: ["I"], label: "Mark in at playhead" },
  { keys: ["O"], label: "Mark out at playhead" },
  { keys: ["L"], label: "Toggle loop" },
  { keys: ["M"], label: "Toggle mute" },
  { keys: ["+", "-"], label: "Zoom timeline" },
  { keys: ["Ctrl", "E"], label: "Export" },
  { keys: ["Ctrl", "O"], label: "Import media" },
];

const formatRulerLabel = (seconds: number, step: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secondsLabel =
    step < 1
      ? secs.toFixed(1).padStart(4, "0")
      : Math.round(secs).toString().padStart(2, "0");
  return `${minutes}:${secondsLabel}`;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest('[role="combobox"], [role="listbox"], [role="slider"]') !==
      null
  );
};

function ToolButton({
  label,
  onClick,
  active,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[5px] text-[#9a968d] transition-colors hover:bg-[#222222] hover:text-[#f3efe6] disabled:pointer-events-none disabled:opacity-40",
        active &&
          "bg-[#221b12] text-[#d0a15c] hover:bg-[#2a2116] hover:text-[#d0a15c]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function PanelHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#232323] px-3">
      <span className="text-xs font-medium text-[#c4beb4]">{title}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function PropertyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[#9a968d]">{label}</span>
      <span className={cn("truncate text-[#f3efe6]", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[#2e2e2e] bg-[#111111] px-1.5 font-mono text-[10px] text-[#c4beb4]">
      {children}
    </kbd>
  );
}

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
  hasMedia,
  isCompressing,
  isGifInput,
  isLooping,
  isPlaying,
  isReady,
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
  onFileDrop,
  onFrameStep,
  onOutputFormatChange,
  onReplaceSource,
  onResetCompressor,
  onResetTrim,
  onSeek,
  onSetInPoint,
  onSetOutPoint,
  onTargetSizeChange,
  onTimelinePointerDown,
  onToggleLoop,
  onTogglePlayPause,
  onTrimHandlePointerDown,
  onVideoTimeUpdate,
}: VideoEditorShellProps) {
  const [previewMode, setPreviewMode] = useState<"original" | "export">(
    compressedVideo ? "export" : "original",
  );
  const [leftTab, setLeftTab] = useState<"media" | "shortcuts">("media");
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  // Some WebM files report an Infinity duration until fully scanned
  const duration = Number.isFinite(videoDuration) ? videoDuration : 0;
  const hasTimeline = hasMedia && !isGifInput;
  const trimStartPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimEndPercent =
    duration > 0 ? Math.min(100, (trimEnd / duration) * 100) : 100;
  const playheadPercent = duration > 0 ? (playheadTime / duration) * 100 : 0;

  const rulerStep =
    RULER_STEPS.find((step) => step >= duration / (8 * zoom)) ??
    RULER_STEPS[RULER_STEPS.length - 1];
  const minorStep = rulerStep / 5;
  const rulerTicks =
    duration > 0
      ? Array.from(
          { length: Math.floor(duration / minorStep) + 1 },
          (_, index) => index * minorStep,
        )
      : [];

  // Render a single layout so the preview <video> (and its ref) exists only once
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setPreviewMode(compressedVideo ? "export" : "original");
  }, [compressedVideo]);

  useEffect(() => {
    setDimensions(null);
    setZoom(1);
  }, [videoObjectUrl]);

  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.muted = isMuted;
    }
  }, [isMuted, videoPreviewRef, videoObjectUrl]);

  // Ctrl/Cmd + wheel zooms the timeline (native listener so preventDefault works)
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((value) =>
        Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, value * (event.deltaY < 0 ? 1.15 : 1 / 1.15)),
        ),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasTimeline]);

  // Keep the playhead in view while playing on a zoomed timeline
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el || zoom <= 1 || !isPlaying) return;
    const contentWidth = el.scrollWidth;
    const x = (playheadPercent / 100) * contentWidth;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollLeft = Math.max(0, x - 48);
    }
  }, [playheadPercent, zoom, isPlaying]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onReplaceSource();
        return;
      }
      if (mod && event.key.toLowerCase() === "e") {
        event.preventDefault();
        if (hasMedia && !isCompressing) onCompress();
        return;
      }
      if (mod || event.altKey || !hasTimeline) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          onTogglePlayPause();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) onSeek(currentTime - 1);
          else onFrameStep(false);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) onSeek(currentTime + 1);
          else onFrameStep(true);
          break;
        case "Home":
          event.preventDefault();
          onSeek(trimStart);
          break;
        case "End":
          event.preventDefault();
          onSeek(trimEnd);
          break;
        case "i":
        case "I":
          onSetInPoint();
          break;
        case "o":
        case "O":
          onSetOutPoint();
          break;
        case "l":
        case "L":
          onToggleLoop();
          break;
        case "m":
        case "M":
          setIsMuted((value) => !value);
          break;
        case "+":
        case "=":
          setZoom((value) => Math.min(MAX_ZOOM, value * 1.5));
          break;
        case "-":
        case "_":
          setZoom((value) => Math.max(MIN_ZOOM, value / 1.5));
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFileDrop(file);
  };

  const selectClassName =
    "h-8 rounded-[5px] border-[#2a2a2a] bg-[#111111] text-xs text-[#f3efe6] focus:ring-1 focus:ring-[#d0a15c]/40 focus:ring-offset-0";
  const selectContentClassName = "border-[#2a2a2a] bg-[#151515] text-[#f3efe6]";

  const renderAssetsPanel = () => (
    <section className="flex h-full min-h-0 bg-[#171717]">
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[#232323] py-2">
        <ToolButton
          label="Media"
          active={leftTab === "media"}
          onClick={() => setLeftTab("media")}
        >
          <FolderOpen className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Keyboard shortcuts"
          active={leftTab === "shortcuts"}
          onClick={() => setLeftTab("shortcuts")}
        >
          <Keyboard className="h-4 w-4" />
        </ToolButton>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {leftTab === "media" ? (
          <>
            <PanelHeader title="Assets">
              <button
                type="button"
                onClick={onReplaceSource}
                disabled={!isReady}
                className="flex h-7 items-center gap-1.5 rounded-[5px] border border-[#2a2a2a] px-2 text-xs text-[#f3efe6] transition-colors hover:bg-[#222222] disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
            </PanelHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {hasMedia ? (
                <div className="group overflow-hidden rounded-[6px] border border-[#2a2a2a] bg-[#111111]">
                  <div className="relative flex aspect-video items-center justify-center bg-[#0b0b0b]">
                    {sourcePreview ? (
                      <img
                        src={sourcePreview}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <Film className="h-5 w-5 text-[#7f7b72]" />
                    )}
                    {duration > 0 && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-[3px] bg-black/70 px-1 font-mono text-[10px] text-[#f3efe6]">
                        {formatTime(duration)}
                      </span>
                    )}
                    <button
                      type="button"
                      title="Remove media"
                      aria-label="Remove media"
                      onClick={onResetCompressor}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-[4px] bg-black/70 text-[#c4beb4] opacity-0 transition-opacity hover:text-[#f3efe6] group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-0.5 px-2.5 py-2">
                    <div
                      className="truncate text-xs text-[#f3efe6]"
                      title={originalFileName ?? undefined}
                    >
                      {originalFileName}
                    </div>
                    <div className="text-[11px] text-[#7f7b72]">
                      {isGifInput ? "GIF" : "Video"} ·{" "}
                      {formatFileSize(originalSize || 0)}
                      {dimensions
                        ? ` · ${dimensions.width}×${dimensions.height}`
                        : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onReplaceSource}
                  disabled={!isReady}
                  className="flex w-full flex-col items-center gap-3 rounded-[6px] border border-dashed border-[#2e2e2e] bg-[#1b1b1b] px-4 py-8 text-center transition-colors hover:border-[#3d3427] hover:bg-[#1d1a16]"
                >
                  <Upload className="h-6 w-6 text-[#c4beb4]" />
                  <span className="text-xs text-[#9a968d]">
                    Drag and drop a video or GIF here, or click to browse
                  </span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <PanelHeader title="Shortcuts" />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2.5">
                {SHORTCUTS.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-[#9a968d]">{shortcut.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );

  const renderPreviewPanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#171717] p-4"
      >
        {!hasMedia ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
            <button
              type="button"
              onClick={onReplaceSource}
              disabled={!isReady}
              className="flex h-9 items-center gap-2 rounded-[6px] bg-[#d0a15c] px-4 text-sm font-medium text-[#111111] transition-colors hover:bg-[#ddb170] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Import media
            </button>
            <p className="text-xs text-[#7f7b72]">
              MP4, MOV, WebM or GIF. Everything is processed locally in your
              browser.
            </p>
            <div className="w-full pt-6 text-left">
              <LatestCommitPill />
            </div>
          </div>
        ) : (
          <>
            {previewMode === "export" &&
              compressedVideo &&
              (isGifInput ? (
                <img
                  src={compressedVideo}
                  alt="Compressed preview"
                  className="max-h-full max-w-full bg-black object-contain"
                />
              ) : (
                <video
                  src={compressedVideo}
                  controls
                  playsInline
                  className="max-h-full max-w-full bg-black object-contain"
                />
              ))}

            {isGifInput ? (
              previewMode === "original" && (
                <img
                  src={videoObjectUrl || ""}
                  alt="Source preview"
                  className="max-h-full max-w-full bg-black object-contain"
                />
              )
            ) : (
              <video
                ref={videoPreviewRef}
                src={videoObjectUrl || ""}
                playsInline
                onClick={onTogglePlayPause}
                onTimeUpdate={onVideoTimeUpdate}
                onLoadedMetadata={(event) =>
                  setDimensions({
                    width: event.currentTarget.videoWidth,
                    height: event.currentTarget.videoHeight,
                  })
                }
                className={cn(
                  "max-h-full max-w-full cursor-pointer bg-black object-contain",
                  previewMode === "export" && compressedVideo && "hidden",
                )}
              />
            )}
          </>
        )}
      </div>

      <div className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-[#232323] px-3">
        <div className="font-mono text-[11px] text-[#7f7b72]">
          {hasTimeline && previewMode === "original" ? (
            <>
              <span className="text-[#d0a15c]">{formatTime(currentTime)}</span>
              <span className="px-1.5">/</span>
              <span>{formatTime(duration)}</span>
            </>
          ) : previewMode === "export" && compressedSize ? (
            <span className="text-[#c4beb4]">
              {formatFileSize(compressedSize)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5">
          {hasTimeline && previewMode === "original" && (
            <>
              <ToolButton
                label="Previous frame (←)"
                onClick={() => onFrameStep(false)}
              >
                <SkipBack className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label={isPlaying ? "Pause (Space)" : "Play (Space)"}
                onClick={onTogglePlayPause}
                className="text-[#f3efe6]"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </ToolButton>
              <ToolButton
                label="Next frame (→)"
                onClick={() => onFrameStep(true)}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </ToolButton>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          {compressedVideo && (
            <div className="flex h-7 items-center rounded-[5px] border border-[#2a2a2a] p-0.5">
              {(["original", "export"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                  className={cn(
                    "h-full rounded-[4px] px-2 text-[11px] transition-colors",
                    previewMode === mode
                      ? "bg-[#2a2a2a] text-[#f3efe6]"
                      : "text-[#9a968d] hover:text-[#f3efe6]",
                  )}
                >
                  {mode === "original" ? "Source" : "Export"}
                </button>
              ))}
            </div>
          )}
          <ToolButton
            label="Fullscreen"
            onClick={toggleFullscreen}
            disabled={!hasMedia}
          >
            <Maximize className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      </div>
    </section>
  );

  const renderPropertiesPanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <PanelHeader title="Properties" />

      {!hasMedia ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#2a2a2a] text-[#9a968d]">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div className="text-sm font-medium text-[#f3efe6]">
            It's empty here
          </div>
          <div className="text-xs text-[#7f7b72]">
            Import a video or GIF to edit its export settings
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 flex gap-2 rounded-[6px] border border-[#5a2929] bg-[#291717] p-2.5 text-xs text-[#f3d8d8]">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3 border-b border-[#232323] p-3">
            <div className="text-xs font-medium text-[#f3efe6]">Export</div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9a968d]">Engine</label>
              <Select
                value={encodeEngine}
                onValueChange={(value) =>
                  onEncodeEngineChange(value as "browser" | "mediabunny")
                }
                disabled={isGifInput}
              >
                <SelectTrigger className={selectClassName}>
                  <SelectValue placeholder="Select engine" />
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  {engineOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9a968d]">Format</label>
              <Select
                value={outputFormat}
                onValueChange={onOutputFormatChange}
                disabled={isGifInput}
              >
                <SelectTrigger className={selectClassName}>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  {formatOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9a968d]">Target size</label>
              <div className="grid grid-cols-4 gap-1">
                {targetSizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onTargetSizeChange(option.value)}
                    className={cn(
                      "h-7 rounded-[5px] border text-[11px] transition-colors",
                      targetSizeMB === option.value
                        ? "border-[#d0a15c]/60 bg-[#221b12] text-[#d0a15c]"
                        : "border-[#2a2a2a] text-[#c4beb4] hover:bg-[#1f1f1f] hover:text-[#f3efe6]",
                    )}
                  >
                    {option.value} MB
                  </button>
                ))}
              </div>
            </div>

            {isGifInput && (
              <p className="text-[11px] leading-relaxed text-[#7f7b72]">
                GIFs are compressed with gifsicle and stay in GIF format.
              </p>
            )}
          </div>

          <div className="space-y-2 border-b border-[#232323] p-3">
            <div className="mb-2.5 text-xs font-medium text-[#f3efe6]">
              Source
            </div>
            <PropertyRow
              label="Size"
              value={formatFileSize(originalSize || 0)}
            />
            {dimensions && (
              <PropertyRow
                label="Resolution"
                value={`${dimensions.width}×${dimensions.height}`}
                mono
              />
            )}
            {!isGifInput && (
              <>
                <PropertyRow
                  label="Duration"
                  value={formatTime(duration)}
                  mono
                />
                <PropertyRow
                  label="Selection"
                  value={`${formatTime(trimStart)} – ${formatTime(trimEnd)}`}
                  mono
                />
                <PropertyRow
                  label="Length"
                  value={formatTime(selectionDuration)}
                  mono
                />
              </>
            )}
          </div>

          {isCompressing && (
            <div className="space-y-2 border-b border-[#232323] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-[#f3efe6]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d0a15c]" />
                  Rendering
                </span>
                <span className="font-mono text-[#9a968d]">{progress}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[#111111]">
                <div
                  className="h-full bg-[#d0a15c] transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {compressionAttempt > 0 && currentQualityLevel && (
                <div className="text-[11px] text-[#7f7b72]">
                  Attempt {compressionAttempt} ·{" "}
                  {currentQualityLevel.replace("_", " ")}
                </div>
              )}
            </div>
          )}

          {compressedVideo && compressedSize && !isCompressing && (
            <div className="space-y-2 p-3">
              <div className="mb-2.5 text-xs font-medium text-[#f3efe6]">
                Result
              </div>
              <PropertyRow
                label="Output size"
                value={formatFileSize(compressedSize)}
              />
              {reductionPercent !== null && (
                <div className="flex items-center gap-1.5 text-xs text-[#9fc0a5]">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {reductionPercent}% smaller than source
                </div>
              )}
              <button
                type="button"
                onClick={onDownload}
                className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-[5px] border border-[#2a2a2a] text-xs text-[#f3efe6] transition-colors hover:bg-[#1f1f1f]"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderTimelinePanel = () => (
    <section className="flex h-full min-h-0 flex-col bg-[#171717]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#232323] px-2">
        <div className="flex items-center gap-0.5">
          <ToolButton
            label="Mark in (I)"
            onClick={onSetInPoint}
            disabled={!hasTimeline}
          >
            <ArrowRightToLine className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Mark out (O)"
            onClick={onSetOutPoint}
            disabled={!hasTimeline}
          >
            <ArrowLeftToLine className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Reset trim"
            onClick={onResetTrim}
            disabled={!hasTimeline}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </ToolButton>
          <div className="mx-1 h-4 w-px bg-[#2a2a2a]" />
          <ToolButton
            label="Loop selection (L)"
            onClick={onToggleLoop}
            active={isLooping}
            disabled={!hasTimeline}
          >
            <Repeat className="h-3.5 w-3.5" />
          </ToolButton>
        </div>

        {hasTimeline && (
          <div className="hidden items-center gap-2 rounded-[5px] border border-[#2a2a2a] px-2.5 py-1 font-mono text-[11px] sm:flex">
            <span className="text-[#9a968d]">{formatTime(trimStart)}</span>
            <span className="text-[#4a4740]">→</span>
            <span className="text-[#9a968d]">{formatTime(trimEnd)}</span>
            <span className="h-3 w-px bg-[#2a2a2a]" />
            <span className="text-[#d0a15c]">
              {formatTime(selectionDuration)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <ToolButton
            label="Zoom out (-)"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value / 1.5))}
            disabled={!hasTimeline || zoom <= MIN_ZOOM}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </ToolButton>
          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.1}
            onValueChange={([value]) => setZoom(value)}
            disabled={!hasTimeline}
            className="w-24"
            trackClassName="h-1 bg-[#2a2a2a]"
            rangeClassName="bg-[#4a4740]"
            thumbClassName="h-3 w-3 border-[#c4beb4] bg-[#171717] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <ToolButton
            label="Zoom in (+)"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value * 1.5))}
            disabled={!hasTimeline || zoom >= MAX_ZOOM}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-20 shrink-0 border-r border-[#232323]">
          <div className="h-7 border-b border-[#232323]" />
          <div className="flex h-16 items-center justify-between px-2.5">
            <span className="font-mono text-[11px] text-[#7f7b72]">V1</span>
            <ToolButton
              label={isMuted ? "Unmute (M)" : "Mute (M)"}
              onClick={() => setIsMuted((value) => !value)}
              disabled={!hasTimeline}
              className="h-6 w-6"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </ToolButton>
          </div>
        </div>

        <div
          ref={timelineScrollRef}
          className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        >
          {!hasTimeline ? (
            <div className="flex h-full flex-col">
              <div className="h-7 border-b border-[#232323]" />
              <div className="flex h-16 items-center border-b border-dashed border-[#262626] px-4 text-xs text-[#4f4c46]">
                {isGifInput
                  ? "GIFs skip trimming. Adjust export settings in Properties."
                  : "Imported media will appear here"}
              </div>
            </div>
          ) : (
            <div
              className="h-full px-3"
              style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
            >
              <div
                ref={filmstripRef}
                className="relative h-full select-none"
                onPointerDown={onTimelinePointerDown}
              >
                {/* Ruler */}
                <div className="relative h-7 cursor-pointer overflow-hidden border-b border-[#232323]">
                  <div
                    className="absolute inset-y-0 bg-[#d0a15c]/10"
                    style={{
                      left: `${trimStartPercent}%`,
                      width: `${trimEndPercent - trimStartPercent}%`,
                    }}
                  />
                  {rulerTicks.map((tick, index) => {
                    const isMajor = index % 5 === 0;
                    return (
                      <div
                        key={index}
                        className="absolute bottom-0"
                        style={{ left: `${(tick / duration) * 100}%` }}
                      >
                        <div
                          className={cn(
                            "w-px",
                            isMajor
                              ? "h-2.5 bg-[#4a4740]"
                              : "h-1.5 bg-[#302e2a]",
                          )}
                        />
                        {isMajor && (
                          <span className="absolute bottom-3 left-1 whitespace-nowrap font-mono text-[10px] text-[#7f7b72]">
                            {formatRulerLabel(tick, rulerStep)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Video track */}
                <div className="relative flex h-16 items-center border-b border-dashed border-[#262626]">
                  <div className="relative h-12 w-full overflow-hidden rounded-[5px] border border-[#2e2e2e] bg-[#111111]">
                    <div className="flex h-full">
                      {thumbnails.length > 0 ? (
                        thumbnails.map((src, index) => (
                          <img
                            key={index}
                            src={src}
                            alt=""
                            className="h-full min-w-0 flex-1 object-cover"
                            draggable={false}
                          />
                        ))
                      ) : (
                        <div className="flex h-full w-full items-center px-3 text-[11px] text-[#4f4c46]">
                          Loading frames…
                        </div>
                      )}
                    </div>
                    <div
                      className="absolute inset-y-0 left-0 bg-[#0b0b0b]/75"
                      style={{ width: `${trimStartPercent}%` }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 bg-[#0b0b0b]/75"
                      style={{ width: `${100 - trimEndPercent}%` }}
                    />
                    <span
                      className="pointer-events-none absolute top-1 max-w-[60%] truncate rounded-[3px] bg-black/60 px-1 text-[10px] text-[#f3efe6]"
                      style={{ left: `calc(${trimStartPercent}% + 12px)` }}
                    >
                      {originalFileName}
                    </span>
                  </div>

                  {/* Selection frame */}
                  <div
                    className="pointer-events-none absolute top-2 bottom-2 rounded-[5px] border-2 border-[#d0a15c]"
                    style={{
                      left: `${trimStartPercent}%`,
                      width: `${trimEndPercent - trimStartPercent}%`,
                    }}
                  />
                  <div
                    className="absolute top-2 bottom-2 z-20 flex w-2.5 cursor-ew-resize items-center justify-center rounded-l-[5px] bg-[#d0a15c]"
                    style={{ left: `${trimStartPercent}%` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onTrimHandlePointerDown(event, "start");
                    }}
                  >
                    <div className="h-4 w-px bg-[#111111]/60" />
                  </div>
                  <div
                    className="absolute top-2 bottom-2 z-20 flex w-2.5 -translate-x-full cursor-ew-resize items-center justify-center rounded-r-[5px] bg-[#d0a15c]"
                    style={{ left: `${trimEndPercent}%` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onTrimHandlePointerDown(event, "end");
                    }}
                  >
                    <div className="h-4 w-px bg-[#111111]/60" />
                  </div>
                </div>

                {/* Playhead */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-[#f3efe6]"
                  style={{ left: `${playheadPercent}%` }}
                >
                  <div className="absolute -left-[5px] top-0 h-2.5 w-[11px] rounded-b-[3px] bg-[#f3efe6]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const resizeHandleClassName =
    "bg-transparent after:bg-transparent data-[panel-group-direction=horizontal]:w-1.5 data-[panel-group-direction=vertical]:h-1.5 transition-colors hover:bg-[#d0a15c]/20 data-[resize-handle-state=drag]:bg-[#d0a15c]/30";

  return (
    <div
      className="relative flex h-screen flex-col bg-[#111111]"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#d0a15c] text-[#111111]">
            <Film className="h-4 w-4" />
          </div>
          <span className="shrink-0 text-sm font-medium text-[#f3efe6]">
            Video Compressor
          </span>
          {originalFileName && (
            <>
              <span className="text-[#3a3a3a]">/</span>
              <span className="truncate text-sm text-[#9a968d]">
                {originalFileName}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {compressedVideo && !isCompressing && (
            <button
              type="button"
              onClick={onDownload}
              className="flex h-8 items-center gap-2 rounded-[6px] border border-[#2a2a2a] px-3 text-xs text-[#f3efe6] transition-colors hover:bg-[#1f1f1f]"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
              {compressedSize ? (
                <span className="hidden font-mono text-[#9a968d] sm:inline">
                  {formatFileSize(compressedSize)}
                </span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            onClick={onCompress}
            disabled={!hasMedia || isCompressing}
            title="Export (Ctrl+E)"
            className="flex h-8 items-center gap-2 rounded-[6px] bg-[#d0a15c] px-3.5 text-xs font-medium text-[#111111] transition-colors hover:bg-[#ddb170] disabled:opacity-50"
          >
            {isCompressing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="font-mono">{progress}%</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                {compressedVideo ? "Re-export" : "Export"}
              </>
            )}
          </button>
        </div>
      </header>

      {!isDesktop ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          <div className="space-y-1.5">
            <div className="h-[48vh] overflow-hidden rounded-[6px]">
              {renderPreviewPanel()}
            </div>
            <div className="h-[168px] overflow-hidden rounded-[6px]">
              {renderTimelinePanel()}
            </div>
            <div className="overflow-hidden rounded-[6px]">
              {renderPropertiesPanel()}
            </div>
            <div className="h-72 overflow-hidden rounded-[6px]">
              {renderAssetsPanel()}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-1.5 pb-1.5">
          <ResizablePanelGroup
            direction="vertical"
            autoSaveId="editor-vertical"
          >
            <ResizablePanel defaultSize={68} minSize={35} className="min-h-0">
              <ResizablePanelGroup
                direction="horizontal"
                autoSaveId="editor-horizontal"
              >
                <ResizablePanel
                  defaultSize={20}
                  minSize={14}
                  maxSize={32}
                  className="min-w-0 overflow-hidden rounded-[6px]"
                >
                  {renderAssetsPanel()}
                </ResizablePanel>
                <ResizableHandle className={resizeHandleClassName} />
                <ResizablePanel
                  defaultSize={58}
                  minSize={30}
                  className="min-w-0 overflow-hidden rounded-[6px]"
                >
                  {renderPreviewPanel()}
                </ResizablePanel>
                <ResizableHandle className={resizeHandleClassName} />
                <ResizablePanel
                  defaultSize={22}
                  minSize={16}
                  maxSize={34}
                  className="min-w-0 overflow-hidden rounded-[6px]"
                >
                  {renderPropertiesPanel()}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle className={resizeHandleClassName} />
            <ResizablePanel
              defaultSize={32}
              minSize={18}
              className="min-h-0 overflow-hidden rounded-[6px]"
            >
              {renderTimelinePanel()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-1.5 z-50 flex items-center justify-center rounded-[8px] border-2 border-dashed border-[#d0a15c]/70 bg-[#111111]/80">
          <div className="flex items-center gap-2 text-sm text-[#f3efe6]">
            <Upload className="h-4 w-4 text-[#d0a15c]" />
            Drop to {hasMedia ? "replace media" : "import"}
          </div>
        </div>
      )}
    </div>
  );
}
