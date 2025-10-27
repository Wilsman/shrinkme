"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Download,
  Upload,
  AlertCircle,
  Scissors,
  RotateCcw,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Settings,
  Film,
  Zap,
  FileVideo,
  CheckCircle,
  Loader2,
  Sparkles,
  Repeat,
} from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Input as MBInput,
  Output as MBOutput,
  Conversion as MBConversion,
  ALL_FORMATS as MB_ALL_FORMATS,
  BlobSource as MBBlobSource,
  BufferTarget as MBBufferTarget,
  Mp4OutputFormat as MBMp4OutputFormat,
  WebMOutputFormat as MBWebMOutputFormat,
  QUALITY_VERY_LOW as MB_QUALITY_VERY_LOW,
  QUALITY_LOW as MB_QUALITY_LOW,
  QUALITY_MEDIUM as MB_QUALITY_MEDIUM,
  QUALITY_HIGH as MB_QUALITY_HIGH,
  QUALITY_VERY_HIGH as MB_QUALITY_VERY_HIGH,
} from "mediabunny";

export function VideoCompressor() {
  const [isReady, setIsReady] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [originalVideo, setOriginalVideo] = useState<File | null>(null);
  const [compressedVideo, setCompressedVideo] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  // Filmstrip thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const FILMSTRIP_COUNT = 12;
  // Trimmer is now always shown when a video is loaded
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState("mp4-h264");
  const [encodeEngine, setEncodeEngine] = useState<"browser" | "mediabunny">(
    "mediabunny"
  );
  const [qualityPreset, setQualityPreset] = useState<
    "auto" | "very_low" | "low" | "medium" | "high" | "very_high"
  >("auto");
  const [targetSizeMB, setTargetSizeMB] = useState<number>(10);
  const [compressionAttempt, setCompressionAttempt] = useState(0);
  const [currentQualityLevel, setCurrentQualityLevel] = useState<string>("");

  // Format options with pros/cons
  const formatOptions = [
    {
      value: "mp4-h264",
      label: "MP4 (H.264)",
      description: "Best compatibility, good quality",
      pros: "Widely supported, good balance",
      cons: "Not smallest file size",
    },
    {
      value: "webm-vp9",
      label: "WebM (VP9)",
      description: "Good for web, open format",
      pros: "Good compression, web optimized",
      cons: "Slower encoding, limited support",
    },
  ];

  const engineOptions = [
    {
      value: "browser",
      label: "Browser (MediaRecorder)",
      description: "Portable, respects trim; slower",
    },
    {
      value: "mediabunny",
      label: "Mediabunny",
      description: "Faster, higher quality conversion",
    },
  ] as const;

  const qualityOptions = [
    { value: "auto", label: "Auto (target size)" },
    { value: "very_low", label: "Very Low" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "very_high", label: "Very High" },
  ] as const;

  const targetSizeOptions = [
    { value: 8, label: "8 MB" },
    { value: 10, label: "10 MB (Default)" },
    { value: 25, label: "25 MB" },
    { value: 50, label: "50 MB" },
    { value: 100, label: "100 MB" },
    { value: 500, label: "500 MB" },
  ] as const;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generatingThumbsRef = useRef(false);
  const filmstripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set ready state immediately since we're using browser APIs
    setIsReady(true);

    // Cleanup function to revoke object URLs when component unmounts
    return () => {
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
      }
      if (compressedVideo) {
        URL.revokeObjectURL(compressedVideo);
      }
    };
  }, [videoObjectUrl, compressedVideo]);

  // Generate filmstrip thumbnails when a new video is loaded
  useEffect(() => {
    async function generateThumbnails(url: string) {
      if (generatingThumbsRef.current) return;
      generatingThumbsRef.current = true;
      try {
        const v = document.createElement("video");
        v.src = url;
        v.crossOrigin = "anonymous";
        v.muted = true;
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => resolve();
          const onErr = () => reject(new Error("thumb-metadata"));
          v.addEventListener("loadedmetadata", onLoaded, { once: true });
          v.addEventListener("error", onErr, { once: true });
          if (v.readyState >= 1) resolve();
        });

        const duration = v.duration || videoDuration;
        if (!duration || !isFinite(duration)) {
          setThumbnails([]);
          return;
        }
        const canvas = document.createElement("canvas");
        const targetWidth = 96;
        const aspect = (v.videoHeight || 9) / (v.videoWidth || 16);
        canvas.width = targetWidth;
        canvas.height = Math.max(1, Math.round(targetWidth * aspect));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setThumbnails([]);
          return;
        }
        const thumbs: string[] = [];
        for (let i = 0; i < FILMSTRIP_COUNT; i++) {
          const t = ((i + 0.5) / FILMSTRIP_COUNT) * duration;
          await new Promise<void>((resolve) => {
            const onSeeked = () => resolve();
            v.currentTime = Math.min(duration - 0.001, Math.max(0, t));
            v.addEventListener("seeked", onSeeked, { once: true });
          });
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          thumbs.push(canvas.toDataURL("image/webp", 0.6));
        }
        setThumbnails(thumbs);
      } catch (e) {
        console.warn("thumbnail generation failed", e);
        setThumbnails([]);
      } finally {
        generatingThumbsRef.current = false;
      }
    }

    if (videoObjectUrl && videoDuration > 0) {
      setThumbnails([]);
      generateThumbnails(videoObjectUrl);
    }
  }, [videoObjectUrl, videoDuration]);

  // Handle video playback in the trimmer
  useEffect(() => {
    const videoElement = videoPreviewRef.current;
    if (!videoElement) return;

    const handleLoadedMetadata = () => {
      const duration = videoElement.duration;
      setVideoDuration(duration);
      // Set trim values to full duration on initial load
      setTrimStart(0);
      setTrimEnd(duration);
      videoElement.currentTime = 0;
    };
    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    // If metadata is already available, call it immediately.
    if (videoElement.readyState >= 2) {
      handleLoadedMetadata();
    }
    return () => {
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [videoObjectUrl]);

  // Control video playback based on isPlaying state
  useEffect(() => {
    const videoElement = videoPreviewRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      // If at the end of trim range, go back to start
      if (videoElement.currentTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }

      videoElement.play().catch((err) => {
        console.error("Error playing video:", err);
        setIsPlaying(false);
      });
    } else {
      videoElement.pause();
    }
  }, [isPlaying, trimStart, trimEnd]);

  // Pause video when compression starts
  useEffect(() => {
    if (isCompressing && videoPreviewRef.current) {
      const video = videoPreviewRef.current;
      video.pause();
      video.muted = true; // Mute the audio
      setIsPlaying(false); // Also update the play/pause button state
    }
    // We don't need to explicitly unmute here, as loading a new video
    // (original or compressed) should reset the muted state.
  }, [isCompressing]);

  // Toast: live progress while compressing
  useEffect(() => {
    if (!isCompressing) return;
    toast.loading("Compressing…", {
      id: "compress",
      description: `${progress}%`,
      duration: Infinity,
    });
  }, [isCompressing, progress]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      // Check if the file is a video
      if (!file.type.startsWith("video/")) {
        setError("Please select a valid video file.");
        toast.error("Invalid file", {
          description: "Please select a valid video file",
        });
        return;
      }

      // Revoke previous object URL if exists
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
      }

      // Create new object URL
      const objectUrl = URL.createObjectURL(file);
      setVideoObjectUrl(objectUrl);

      setOriginalVideo(file);
      setOriginalSize(file.size);
      setCompressedVideo(null);
      setCompressedSize(null);
      setError(null);
      setThumbnails([]);

      // Reset trimming values - only set start to 0, don't set end yet
      // The end will be set when metadata is loaded
      setCurrentTime(0);
      setTrimStart(0);
      // Don't set trimEnd to 0 here, as it will be set to video duration in handleLoadedMetadata
      setIsPlaying(false);

      // Toast: uploaded
      toast.success("Video selected", {
        description: `${file.name} • ${formatFileSize(file.size)}`,
      });
    }
  };

  // Dragging trim handles on filmstrip
  const handleTrimHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    edge: "start" | "end"
  ) => {
    e.preventDefault();
    const container = filmstripRef.current;
    if (!container || videoDuration <= 0) return;
    const rect = container.getBoundingClientRect();
    const minTrim = 0.1; // 100ms

    const pointerId = e.pointerId;
    const handleEl = e.currentTarget as HTMLElement | null;
    handleEl?.setPointerCapture?.(pointerId);

    const onMove = (ev: PointerEvent) => {
      const pos = (ev.clientX - rect.left) / rect.width;
      const t = Math.max(0, Math.min(1, pos)) * videoDuration;
      if (edge === "start") {
        const ns = Math.min(t, trimEnd - minTrim);
        setTrimStart(ns);
        if (currentTime < ns) handleSeek(ns);
      } else {
        const ne = Math.max(t, trimStart + minTrim);
        const clamped = Math.min(videoDuration, ne);
        setTrimEnd(clamped);
        if (currentTime > clamped) handleSeek(clamped);
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      handleEl?.releasePointerCapture?.(pointerId);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  // Format time in MM:SS.ms format
  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const milliseconds = Math.floor((timeInSeconds % 1) * 100);

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
  };

  // Handle seeking to a specific time
  const handleSeek = (time: number) => {
    const videoElement = videoPreviewRef.current;
    if (!videoElement) return;

    // Ensure time is within video bounds
    const clampedTime = Math.max(0, Math.min(time, videoElement.duration));
    // Ensure time is within trim bounds
    const boundedTime = Math.max(trimStart, Math.min(trimEnd, clampedTime));

    videoElement.currentTime = boundedTime;
    setCurrentTime(boundedTime);
  };

  // Handle timeline pointer interaction for smooth scrubbing
  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore if starting drag on the slider (thumbs or track) so trim dragging isn't hijacked
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest(".timeline-slider") ||
      targetEl.closest('[role="slider"]')
    )
      return;

    const timelineRect = e.currentTarget.getBoundingClientRect();

    const updateCurrentTime = (clientX: number) => {
      const pos = (clientX - timelineRect.left) / timelineRect.width;
      const newTime = Math.max(
        trimStart,
        Math.min(trimEnd, pos * videoDuration)
      );
      handleSeek(newTime);
    };

    // Update immediately on pointer down
    updateCurrentTime(e.clientX);

    const handlePointerMove = (event: PointerEvent) => {
      updateCurrentTime(event.clientX);
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  // Handle frame-by-frame navigation (approximately 1/30th of a second)
  const handleFrameStep = (forward: boolean) => {
    const videoElement = videoPreviewRef.current;
    if (videoElement) {
      const frameTime = 1 / 30; // Assuming 30fps
      const newTime = forward
        ? Math.min(trimEnd, currentTime + frameTime)
        : Math.max(trimStart, currentTime - frameTime);

      videoElement.currentTime = newTime;
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // Reset trim to full video
  const resetTrim = () => {
    const videoElement = videoPreviewRef.current;
    if (!videoElement) return;

    setTrimStart(0);
    setTrimEnd(videoElement.duration);
    handleSeek(0);
  };

  // Compress the video using MediaRecorder
  const compressVideo = async () => {
    if (!originalVideo || !videoPreviewRef.current) {
      setError("Please select a video file first.");
      return;
    }

    // If Mediabunny is selected, delegate to it
    if (encodeEngine === "mediabunny") {
      await compressWithMediabunny();
      return;
    }

    setIsCompressing(true);
    setError(null);
    setCompressedVideo(null);
    setCompressedSize(null);
    setProgress(0);
    // Ensure preview playback is stopped while compressing
    setIsPlaying(false);

    // Toast: start processing
    toast.loading("Compressing…", {
      id: "compress",
      description: "0%",
      duration: Infinity,
    });

    const video = videoPreviewRef.current;

    try {
      // Preserve current mute/volume and mute during compression to avoid audible playback
      const previousVideoMuted = video.muted;
      const previousVideoVolume = video.volume;
      video.muted = true;
      video.volume = 0;

      // --- WAIT FOR METADATA ---
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        console.log("Waiting for video metadata...");
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            console.log("Metadata loaded.");
            resolve();
          };
          const onError = (e: Event | string) => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            console.error("Error loading video metadata:", e);
            reject(new Error("Failed to load video metadata"));
          };
          video.addEventListener("loadedmetadata", onLoadedMetadata);
          video.addEventListener("error", onError);
        });
      }
      // Now we are sure video.duration is available
      const currentVideoDuration = video.duration;
      // --- END WAIT ---

      // Get video dimensions
      const { videoWidth, videoHeight } = video;

      // Validate trim values and set to actual video bounds if invalid
      let actualStartTime = trimStart;
      let actualEndTime = trimEnd;

      // Reset to full video if values are invalid
      if (
        trimStart === trimEnd ||
        trimStart > trimEnd ||
        trimEnd <= 0 ||
        trimEnd > currentVideoDuration
      ) {
        console.log(
          "Invalid trim values detected, resetting to full video duration"
        );
        actualStartTime = 0;
        actualEndTime = currentVideoDuration;

        // Also update the state values for UI consistency
        setTrimStart(actualStartTime);
        setTrimEnd(actualEndTime);
      }

      const effectiveDuration = actualEndTime - actualStartTime;

      // Double-check effective duration
      if (effectiveDuration <= 0) {
        console.error(
          "Final calculated duration is still invalid. Forcing to full video duration.",
          "Start:",
          actualStartTime,
          "End:",
          actualEndTime,
          "Video Duration:",
          currentVideoDuration
        );

        // Force to full video as last resort
        actualStartTime = 0;
        actualEndTime = currentVideoDuration;
        setTrimStart(actualStartTime);
        setTrimEnd(actualEndTime);
      }

      // Recalculate with final values
      const finalEffectiveDuration = actualEndTime - actualStartTime;

      console.log(
        `Using final trim values - Start: ${actualStartTime}s, End: ${actualEndTime}s, Duration: ${finalEffectiveDuration}s`
      );

      // Target size: Use 93% of selected target to ensure we stay below the limit
      const TARGET_SIZE_BITS = targetSizeMB * 0.93 * 8 * 1024 * 1024;

      // Calculate target bitrate based on duration to achieve target file size
      // Reserve ~35% for audio and container overhead
      const videoTargetBits = TARGET_SIZE_BITS * 0.65;
      const targetVideoBitrate = Math.floor(
        videoTargetBits / finalEffectiveDuration
      );

      // Ensure minimum quality (300kbps) and maximum quality (3.5Mbps)
      const videoBitsPerSecond = Math.max(
        300000,
        Math.min(targetVideoBitrate, 3500000)
      );

      console.log(
        `Trimmed duration: ${finalEffectiveDuration}s, Target bitrate: ${
          videoBitsPerSecond / 1000
        }kbps`
      );

      // Calculate target resolution based on bitrate
      // Higher bitrate allows for higher resolution
      let scaleFactor = 1;
      if (videoBitsPerSecond < 1000000) {
        // For low bitrates, reduce resolution more aggressively
        scaleFactor = 0.5;
      } else if (videoBitsPerSecond < 2000000) {
        scaleFactor = 0.65;
      } else if (videoBitsPerSecond < 3000000) {
        scaleFactor = 0.75;
      } else {
        scaleFactor = 0.85;
      }

      // Apply resolution scaling
      let targetWidth = Math.floor(videoWidth * scaleFactor);
      let targetHeight = Math.floor(videoHeight * scaleFactor);

      // Ensure dimensions are even (required by some codecs)
      targetWidth = targetWidth - (targetWidth % 2);
      targetHeight = targetHeight - (targetHeight % 2);

      // Cap maximum dimension to 1280px for very high-res videos
      const MAX_DIMENSION = 1280;
      if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
        if (targetWidth > targetHeight) {
          const ratio = MAX_DIMENSION / targetWidth;
          targetWidth = MAX_DIMENSION;
          targetHeight = Math.floor(targetHeight * ratio);
        } else {
          const ratio = MAX_DIMENSION / targetHeight;
          targetHeight = MAX_DIMENSION;
          targetWidth = Math.floor(targetWidth * ratio);
        }
        // Ensure dimensions are even
        targetWidth = targetWidth - (targetWidth % 2);
        targetHeight = targetHeight - (targetHeight % 2);
      }

      console.log(
        `Original resolution: ${videoWidth}x${videoHeight}, Target resolution: ${targetWidth}x${targetHeight}`
      );

      // Create canvas for processing frames
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d", { alpha: false }); // Disable alpha for better performance

      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      // Determine original video framerate (default to 30fps if can't be determined)
      let fps = 30;

      // Try to get the actual framerate if possible
      try {
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 100)); // Let it play briefly
        video.pause();

        // Some browsers expose framerate info
        if ("getVideoPlaybackQuality" in video) {
          const quality = (video as any).getVideoPlaybackQuality();
          if (quality && quality.totalVideoFrames > 0) {
            fps = Math.min(
              60,
              Math.max(
                24,
                Math.round(quality.totalVideoFrames / video.duration)
              )
            );
          }
        }
      } catch (e) {
        console.warn("Could not determine framerate:", e);
      }

      console.log(`Using framerate: ${fps}fps`);

      // Set up output stream from canvas (video) and add source audio via captureStream
      const stream = (canvas as any).captureStream(fps);

      // Prefer grabbing the original video's audio track via captureStream for reliability
      const sourceStream = (video as any).captureStream();
      sourceStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        stream.addTrack(track);
      });

      // Audio bitrate based on video length (longer videos get lower audio bitrate)
      const audioBitsPerSecond = finalEffectiveDuration > 60 ? 96000 : 128000;

      // Choose a supported recorder MIME type. Fallback to WebM+Opus if MP4 is unsupported.
      const mimeCandidates =
        outputFormat === "mp4-h264"
          ? [
              "video/mp4;codecs=avc1,mp4a.40.2",
              "video/mp4;codecs=avc1",
              "video/mp4",
              // fallbacks to webm if mp4 is not supported
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
            ]
          : [
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
            ];

      const supportedMime = mimeCandidates.find((t) =>
        (window as any).MediaRecorder?.isTypeSupported?.(t)
      );

      const recorderOptions: MediaRecorderOptions = {
        mimeType: supportedMime,
        videoBitsPerSecond: videoBitsPerSecond,
        audioBitsPerSecond: audioBitsPerSecond,
      };

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Use the recorder's actual MIME type (ensures audio codec/container alignment)
        const actualType =
          mediaRecorder.mimeType || chunks[0]?.type || "video/webm";

        // Create compressed video blob with the actual type
        const blob = new Blob(chunks, { type: actualType });
        const compressedUrl = URL.createObjectURL(blob);
        setRecordedMimeType(actualType);

        // Check if we're under target size
        const finalSize = blob.size;
        const targetBytes = targetSizeMB * 1024 * 1024;

        if (finalSize > targetBytes) {
          console.warn(
            `Compressed size ${finalSize} is still over ${targetSizeMB}MB, would need further compression`
          );
          // We'll still use this result as it's the best we can do with one pass
        } else {
          console.log(
            `Successfully compressed to ${finalSize / (1024 * 1024)}MB (${(
              (finalSize / targetBytes) *
              100
            ).toFixed(1)}% of ${targetSizeMB}MB limit)`
          );
        }

        setCompressedVideo(compressedUrl);
        setCompressedSize(finalSize);
        setIsCompressing(false);

        // Toast: finished with details and open action
        const original = originalSize ?? 0;
        const reduction =
          original > 0 ? Math.round((1 - finalSize / original) * 100) : null;
        toast.success("Compression complete", {
          id: "compress",
          description:
            original && reduction !== null
              ? `${formatFileSize(original)} → ${formatFileSize(
                  finalSize
                )} • ${reduction}% smaller`
              : `${formatFileSize(finalSize)}`,
          action: {
            label: "Open",
            onClick: () => window.open(compressedUrl, "_blank"),
          },
        });

        // Clean up
        video.pause();
        // Restore previous mute/volume state
        video.muted = previousVideoMuted;
        video.volume = previousVideoVolume;
      };

      // Start recording
      mediaRecorder.start(100); // Collect data in 100ms chunks

      // IMPROVED FRAME PROCESSING
      // Instead of manually seeking through the video, we'll play it normally
      // and capture frames as it plays, which should maintain proper timing and audio sync

      // Draw function to update the canvas with the current video frame
      const drawFrame = () => {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        // Update progress based on current time relative to trim range
        const progressPercent = Math.min(
          100,
          Math.round(
            ((video.currentTime - trimStart) / finalEffectiveDuration) * 100
          )
        );
        setProgress(progressPercent);

        // Continue drawing frames until we reach the trim end
        if (!video.ended && !video.paused && video.currentTime < trimEnd) {
          requestAnimationFrame(drawFrame);
        } else if (video.currentTime >= trimEnd) {
          // Reached the end of the trim range
          mediaRecorder.stop();
        } else {
          // Video playback ended or paused unexpectedly
          mediaRecorder.stop();
        }
      };

      // Start playback from trim start
      video.currentTime = trimStart;
      await video.play();

      // Start drawing frames
      drawFrame();
    } catch (err) {
      setError(
        "Failed to compress video. Please try again with a different file."
      );
      toast.error("Compression failed", {
        id: "compress",
        description: "Please try again with a different file",
      });
      console.error(err);
      setIsCompressing(false);
    }
  };

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Download the compressed video
  const downloadCompressedVideo = () => {
    if (!compressedVideo) return;

    const a = document.createElement("a");
    a.href = compressedVideo;
    const ext = recordedMimeType?.includes("mp4") ? "mp4" : "webm";
    a.download = originalVideo
      ? `compressed-${originalVideo.name.replace(/\.[^/.]+$/, "")}.${ext}`
      : `compressed-video.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset everything to start over with a new video
  const resetCompressor = () => {
    // Revoke object URLs to free memory
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
    }
    if (compressedVideo) {
      URL.revokeObjectURL(compressedVideo);
    }

    // Reset all state
    setOriginalVideo(null);
    setVideoObjectUrl(null);
    setCompressedVideo(null);
    setCompressedSize(null);
    setOriginalSize(null);
    setError(null);
    setProgress(0);
    setIsCompressing(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    setThumbnails([]);
    setRecordedMimeType(null);

    toast.success("Ready for new video", {
      description: "Select a video to compress",
    });
  };

  // Compress using Mediabunny Conversion with automated quality iteration
  const compressWithMediabunny = async () => {
    if (!originalVideo) return;

    setIsCompressing(true);
    setError(null);
    setCompressedVideo(null);
    setCompressedSize(null);
    setProgress(0);
    setCompressionAttempt(0);

    toast.loading("Converting…", {
      id: "compress",
      description: "Starting automated compression",
      duration: Infinity,
    });

    // Quality levels to try in descending order (highest to lowest)
    const qualityLevels = [
      { name: "very_high", quality: MB_QUALITY_VERY_HIGH },
      { name: "high", quality: MB_QUALITY_HIGH },
      { name: "medium", quality: MB_QUALITY_MEDIUM },
      { name: "low", quality: MB_QUALITY_LOW },
      { name: "very_low", quality: MB_QUALITY_VERY_LOW },
    ];

    const targetBytes = targetSizeMB * 1024 * 1024;
    let bestResult: { blob: Blob; url: string; quality: string } | null = null;
    let lastAttemptSize = 0;

    try {
      // Probe dimensions once
      const v = document.createElement("video");
      v.src = videoObjectUrl || URL.createObjectURL(originalVideo);
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        v.addEventListener("loadedmetadata", done, { once: true });
        if (v.readyState >= 1) resolve();
      });

      const effectiveDuration = Math.max(
        0.01,
        (trimEnd || videoDuration) - (trimStart || 0)
      );
      const audioBitsPerSecond = effectiveDuration > 60 ? 96000 : 128000;

      // Iterate through quality levels from highest to lowest
      for (let i = 0; i < qualityLevels.length; i++) {
        const { name, quality } = qualityLevels[i];
        setCompressionAttempt(i + 1);
        setCurrentQualityLevel(name);
        setProgress(0);

        toast.loading("Converting…", {
          id: "compress",
          description: `Attempt ${i + 1}/${
            qualityLevels.length
          }: ${name} quality`,
          duration: Infinity,
        });

        // Prepare input and output for this attempt
        const input = new MBInput({
          source: new MBBlobSource(originalVideo),
          formats: MB_ALL_FORMATS,
        });

        const format =
          outputFormat === "mp4-h264"
            ? new MBMp4OutputFormat()
            : new MBWebMOutputFormat();

        const target = new MBBufferTarget();
        const output = new MBOutput({ format, target });

        // Calculate dimensions based on quality level
        let scaleFactor = 1;
        switch (name) {
          case "very_high":
            scaleFactor = 0.95;
            break;
          case "high":
            scaleFactor = 0.85;
            break;
          case "medium":
            scaleFactor = 0.75;
            break;
          case "low":
            scaleFactor = 0.65;
            break;
          case "very_low":
            scaleFactor = 0.5;
            break;
        }

        let targetWidth = Math.max(2, Math.floor(v.videoWidth * scaleFactor));
        let targetHeight = Math.max(2, Math.floor(v.videoHeight * scaleFactor));
        targetWidth -= targetWidth % 2;
        targetHeight -= targetHeight % 2;

        const MAX_DIMENSION = 1280;
        if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
          if (targetWidth > targetHeight) {
            const ratio = MAX_DIMENSION / targetWidth;
            targetWidth = MAX_DIMENSION;
            targetHeight = Math.floor(targetHeight * ratio);
          } else {
            const ratio = MAX_DIMENSION / targetHeight;
            targetHeight = MAX_DIMENSION;
            targetWidth = Math.floor(targetWidth * ratio);
          }
          targetWidth -= targetWidth % 2;
          targetHeight -= targetHeight % 2;
        }

        // Initialize conversion
        const conv = await MBConversion.init({
          input,
          output,
          trim:
            videoDuration > 0
              ? {
                  start: Math.max(0, trimStart),
                  end: Math.min(videoDuration, trimEnd || videoDuration),
                }
              : undefined,
          video: {
            codec:
              outputFormat === "mp4-h264" ? ("avc" as any) : ("vp9" as any),
            bitrate: quality as any,
            width: targetWidth || undefined,
            forceTranscode: true,
          },
          audio: {
            codec:
              outputFormat === "mp4-h264" ? ("aac" as any) : ("opus" as any),
            bitrate: audioBitsPerSecond as any,
            forceTranscode: true,
          },
        });

        // Progress updates
        conv.onProgress = (p: number) => {
          const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
          setProgress(pct);
          toast.loading("Converting…", {
            id: "compress",
            description: `Attempt ${i + 1}/${
              qualityLevels.length
            }: ${name} - ${pct}%`,
            duration: Infinity,
          });
        };

        // Execute conversion
        await conv.execute();

        const buffer = target.buffer as ArrayBuffer;
        const mime = outputFormat === "mp4-h264" ? "video/mp4" : "video/webm";
        const blob = new Blob([buffer], { type: mime });
        lastAttemptSize = blob.size;

        console.log(
          `Attempt ${i + 1} (${name}): ${formatFileSize(
            blob.size
          )} / ${formatFileSize(targetBytes)} target`
        );

        // Check if this result meets the target size
        if (blob.size <= targetBytes) {
          // Success! This quality level produces a file under the target size
          const url = URL.createObjectURL(blob);
          bestResult = { blob, url, quality: name };

          toast.success("Compression complete", {
            id: "compress",
            description: `${formatFileSize(blob.size)} with ${name} quality (${
              i + 1
            }/${qualityLevels.length} attempts)`,
          });

          break;
        } else {
          // File is still too large, try next quality level
          if (i === qualityLevels.length - 1) {
            // This was the last attempt, use it anyway
            const url = URL.createObjectURL(blob);
            bestResult = { blob, url, quality: name };

            toast.warning("Compression complete", {
              id: "compress",
              description: `${formatFileSize(
                blob.size
              )} (exceeds ${targetSizeMB}MB target, used lowest quality)`,
            });
          } else {
            // Continue to next quality level
            console.log(
              `File too large (${formatFileSize(
                blob.size
              )}), trying lower quality...`
            );
          }
        }
      }

      // Apply the best result
      if (bestResult) {
        setCompressedVideo(bestResult.url);
        setCompressedSize(bestResult.blob.size);
        setRecordedMimeType(
          outputFormat === "mp4-h264" ? "video/mp4" : "video/webm"
        );
        setProgress(100);
      }
    } catch (e: any) {
      console.error("Mediabunny conversion failed", e);
      setError(e?.message || "Mediabunny conversion failed");
      toast.error("Conversion error", {
        id: "compress",
        description: e?.message || String(e),
      });
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0C0C]">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-[#0C0C0C]/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <Film className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Video Compressor
                </h1>
                <p className="text-sm text-zinc-400">
                  Compress videos while maintaining quality
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {originalVideo && (
                <div className="flex items-center space-x-2 text-sm text-zinc-400">
                  <FileVideo className="h-4 w-4" />
                  <span className="font-medium">{originalVideo.name}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-1">
                    {formatFileSize(originalSize || 0)}
                  </span>
                </div>
              )}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {!originalVideo ? (
          // Upload State
          <div className="flex min-h-[600px] items-center justify-center">
            <div className="w-full max-w-2xl">
              <div
                className="group relative overflow-hidden rounded-3xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 p-12 transition-all duration-300 hover:border-blue-500 hover:shadow-2xl"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add("border-blue-500", "bg-blue-950/30");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-blue-500", "bg-blue-950/30");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-blue-500", "bg-blue-950/30");

                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    const event = {
                      target: { files: [file] },
                    } as unknown as React.ChangeEvent<HTMLInputElement>;
                    handleFileChange(event);
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*"
                  className="hidden"
                />

                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-900/30 to-purple-900/30">
                    <Upload className="h-10 w-10 text-blue-400" />
                  </div>
                  <h2 className="mb-3 text-2xl font-semibold text-zinc-100">
                    Drop your video here
                  </h2>
                  <p className="mb-8 text-zinc-400">
                    or click the button below to browse
                  </p>
                  <Button
                    onClick={handleUploadClick}
                    size="lg"
                    className="h-12 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 font-medium text-white shadow-lg transition-all hover:shadow-xl hover:scale-105"
                    disabled={!isReady}
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    Select Video
                  </Button>
                  <div className="mt-6 flex items-center justify-center space-x-6 text-xs text-zinc-500">
                    <span className="flex items-center">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      MP4, MOV, AVI
                    </span>
                    <span className="flex items-center">
                      <Zap className="mr-1 h-3 w-3" />
                      Fast processing
                    </span>
                    <span className="flex items-center">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Quality preserved
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Editor State
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Panel - Settings */}
            <div className="lg:col-span-1">
              <Card className="h-full border-0 bg-zinc-900/50 shadow-xl backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center text-lg text-zinc-100">
                    <Settings className="mr-2 h-5 w-5" />
                    Compression Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Encoder Selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-zinc-300">
                      Encoding Engine
                    </label>
                    <Select
                      value={encodeEngine}
                      onValueChange={(v) => setEncodeEngine(v as any)}
                    >
                      <SelectTrigger className="h-11 bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="Select encoder" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {engineOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-zinc-100">
                            <div>
                              <div className="font-medium">{option.label}</div>
                              <div className="text-xs text-zinc-400">
                                {option.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {encodeEngine === "mediabunny" && (
                      <div className="rounded-lg bg-blue-900/20 p-3 text-xs text-blue-300">
                        <Sparkles className="mr-1 inline h-3 w-3" />
                        Automatically finds optimal quality for your target size
                      </div>
                    )}
                  </div>

                  {/* Target Size */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-zinc-300">
                      Target File Size
                    </label>
                    <Select
                      value={targetSizeMB.toString()}
                      onValueChange={(v) => setTargetSizeMB(Number(v))}
                    >
                      <SelectTrigger className="h-11 bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="Select target size" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {targetSizeOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value.toString()}
                            className="text-zinc-100"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-zinc-500">
                      Output will be compressed to stay under {targetSizeMB} MB
                    </div>
                  </div>

                  {/* Output Format */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-zinc-300">
                      Output Format
                    </label>
                    <Select value={outputFormat} onValueChange={setOutputFormat}>
                      <SelectTrigger className="h-11 bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {formatOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-zinc-100">
                            <div>
                              <div className="font-medium">{option.label}</div>
                              <div className="text-xs text-zinc-400">
                                {option.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3 pt-4">
                    {!compressedVideo && !isCompressing && (
                      <Button
                        onClick={compressVideo}
                        className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 font-medium text-white shadow-lg transition-all hover:shadow-xl"
                        disabled={!isReady || !originalVideo}
                      >
                        <Scissors className="mr-2 h-4 w-4" />
                        Compress Video
                      </Button>
                    )}

                    {isCompressing && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-center text-sm text-zinc-400">
                          {compressionAttempt > 0 && currentQualityLevel ? (
                            <>
                              Attempt {compressionAttempt}/5: {currentQualityLevel} quality - {progress}%
                            </>
                          ) : (
                            <>Compressing... {progress}%</>
                          )}
                        </p>
                      </div>
                    )}

                    {compressedVideo && compressedSize && (
                      <div className="space-y-4">
                        <div className="rounded-lg bg-green-900/20 p-4 border border-green-800/30">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">
                              Original:
                            </span>
                            <span className="font-medium text-zinc-100">
                              {formatFileSize(originalSize!)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <span className="text-zinc-400">
                              Compressed:
                            </span>
                            <span className="font-medium text-green-400">
                              {formatFileSize(compressedSize)}
                            </span>
                          </div>
                          {originalSize && compressedSize && (
                            <div className="mt-3 text-center">
                              <span className="inline-flex items-center rounded-full bg-green-900/30 px-3 py-1 text-sm font-medium text-green-300">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                {Math.round(
                                  (1 - compressedSize / originalSize) * 100
                                )}% smaller
                              </span>
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={downloadCompressedVideo}
                          className="h-12 w-full rounded-xl font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg"
                          variant="default"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Compressed
                        </Button>

                        <Button
                          onClick={resetCompressor}
                          variant="outline"
                          className="h-12 w-full rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-md border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Compress Another
                        </Button>
                      </div>
                    )}

                    {!compressedVideo && (
                      <Button
                        onClick={handleUploadClick}
                        variant="ghost"
                        className="h-12 w-full rounded-xl transition-all duration-200 hover:scale-105 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      >
                        Choose Different Video
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Video Preview */}
            <div className="lg:col-span-2">
              <Card className="h-full border-0 bg-zinc-900/50 shadow-xl backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center text-lg text-zinc-100">
                    <Film className="mr-2 h-5 w-5" />
                    {compressedVideo ? "Preview Results" : "Video Preview & Trim"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-5rem)]">
                  {compressedVideo ? (
                    <Tabs
                      defaultValue="compressed"
                      className="flex h-full flex-col"
                    >
                      <TabsList className="grid w-full grid-cols-2 bg-zinc-800">
                        <TabsTrigger value="original" className="text-zinc-300 data-[state=active]:text-zinc-100">Original</TabsTrigger>
                        <TabsTrigger value="compressed" className="text-zinc-300 data-[state=active]:text-zinc-100">Compressed</TabsTrigger>
                      </TabsList>
                      <TabsContent value="original" className="flex-1 mt-6">
                        <video
                          src={videoObjectUrl!}
                          controls
                          className="h-full w-full rounded-xl bg-black object-contain"
                          playsInline
                        />
                      </TabsContent>
                      <TabsContent value="compressed" className="flex-1 mt-6">
                        <video
                          src={compressedVideo}
                          controls
                          className="h-full w-full rounded-xl bg-black object-contain"
                          playsInline
                        />
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="flex h-full flex-col space-y-6">
                      {/* Video Player Container */}
                      <div className="group relative flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-black shadow-2xl transition-all duration-300 hover:shadow-3xl">
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-white text-sm font-medium">
                              <Film className="h-4 w-4" />
                              <span>Video Preview</span>
                            </div>
                            <div className="flex items-center space-x-2 text-white text-sm">
                              <span className="rounded-full bg-white/20 px-2 py-1 backdrop-blur-sm">
                                {formatFileSize(originalSize || 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <video
                          ref={videoPreviewRef}
                          src={videoObjectUrl!}
                          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                          playsInline
                          onClick={togglePlayPause}
                          onTimeUpdate={(e) => {
                            const currentTime = e.currentTarget.currentTime;
                            setCurrentTime(currentTime);
                            
                            // Handle looping within trimmed area
                            if (isLooping && isPlaying && currentTime >= trimEnd) {
                              e.currentTarget.currentTime = trimStart;
                            }
                          }}
                        />
                        
                        {/* Center Play Button Overlay */}
                        {!isPlaying && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-all duration-300 group-hover:scale-110">
                              <Play className="h-8 w-8 text-white ml-1" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        {/* Combined Time Display & Playback Controls */}
                        <div className="rounded-xl bg-zinc-800/50 p-3 border border-zinc-700">
                          <div className="flex items-center justify-between">
                            {/* Time Display */}
                            <div className="flex items-center space-x-4 text-xs font-mono">
                              <div className="flex items-center space-x-1">
                                <span className="text-blue-400">Current:</span>
                                <span className="text-zinc-100 font-medium">{formatTime(currentTime)}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="text-purple-400">Duration:</span>
                                <span className="text-zinc-100 font-medium">{formatTime(videoDuration)}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="text-emerald-400">Remaining:</span>
                                <span className="text-zinc-100 font-medium">{formatTime(videoDuration - currentTime)}</span>
                              </div>
                            </div>
                            
                            {/* Playback Controls */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => handleFrameStep(false)}
                                className="h-8 w-8 rounded-lg bg-zinc-800 border-zinc-600 transition-all duration-200 hover:scale-105 hover:bg-zinc-700"
                                title="Previous frame"
                              >
                                <SkipBack className="h-3 w-3 text-zinc-300" />
                              </Button>
                              
                              <Button
                                size="icon"
                                onClick={togglePlayPause}
                                className="h-10 w-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-purple-700"
                                title={isPlaying ? "Pause" : "Play"}
                              >
                                {isPlaying ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4 ml-0.5" />
                                )}
                              </Button>
                              
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => handleFrameStep(true)}
                                className="h-8 w-8 rounded-lg bg-zinc-800 border-zinc-600 transition-all duration-200 hover:scale-105 hover:bg-zinc-700"
                                title="Next frame"
                              >
                                <SkipForward className="h-3 w-3 text-zinc-300" />
                              </Button>
                              
                              <div className="h-px w-4 bg-zinc-700" />
                              
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setIsLooping(!isLooping)}
                                className={`h-8 w-8 rounded-lg transition-all duration-200 hover:scale-105 hover:bg-zinc-800 ${
                                  isLooping 
                                    ? 'text-blue-400 bg-blue-900/20 hover:bg-blue-900/30' 
                                    : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                                title={isLooping ? "Looping enabled" : "Looping disabled"}
                              >
                                <Repeat className="h-3 w-3" />
                              </Button>
                              
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={resetTrim}
                                className="h-8 w-8 rounded-lg transition-all duration-200 hover:scale-105 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                                title="Reset trim"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Minimalist Timeline Section */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-300">
                              Trim Video
                            </h3>
                            <button
                              onClick={resetTrim}
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Reset All
                            </button>
                          </div>
                          
                          {/* Simple Progress Bar */}
                          <div
                            className="relative h-2 w-full cursor-pointer rounded-full bg-zinc-800"
                            onPointerDown={handleTimelinePointerDown}
                          >
                            {videoDuration > 0 && (
                              <>
                                {/* Trimmed Area */}
                                <div
                                  className="absolute top-0 h-full rounded-full bg-blue-500"
                                  style={{
                                    left: `${(trimStart / videoDuration) * 100}%`,
                                    width: `${((trimEnd - trimStart) / videoDuration) * 100}%`,
                                  }}
                                />
                                {/* Current Position */}
                                <div
                                  className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white border-2 border-zinc-600 shadow-sm"
                                  style={{
                                    left: `${(currentTime / videoDuration) * 100}%`,
                                  }}
                                />
                              </>
                            )}
                          </div>

                          {/* Simple Filmstrip */}
                          <div
                            ref={filmstripRef}
                            className="relative h-16 overflow-hidden rounded-lg bg-zinc-800 border border-zinc-700"
                          >
                            <div className="flex h-full w-full">
                              {thumbnails.length > 0 ? (
                                thumbnails.map((src, i) => (
                                  <img
                                    key={i}
                                    src={src}
                                    alt="thumb"
                                    className="h-full w-20 flex-none object-cover"
                                    draggable={false}
                                  />
                                ))
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                                  Loading...
                                </div>
                              )}
                            </div>

                            {/* Slim Trim Handles */}
                            {videoDuration > 0 && (
                              <>
                                {/* Start Handle */}
                                <div
                                  className="absolute inset-y-0 w-12 cursor-ew-resize group z-20"
                                  style={{
                                    left: `max(0px, min(${(trimStart / videoDuration) * 100}%, calc(100% - 60px)))`,
                                  }}
                                  onPointerDown={(e) =>
                                    handleTrimHandlePointerDown(e, "start")
                                  }
                                >
                                  {/* Handle Line */}
                                  <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-blue-400 to-transparent" />
                                  
                                  {/* Handle Circle */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg border border-white/30 transition-all duration-200 group-hover:scale-110">
                                    <div className="absolute inset-0.5 rounded-full bg-white/40" />
                                  </div>
                                  
                                  {/* Handle Label */}
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                    <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium shadow-lg">
                                      START
                                      <div className="text-blue-100 font-mono text-xs">{formatTime(trimStart)}</div>
                                    </div>
                                  </div>
                                </div>

                                {/* End Handle */}
                                <div
                                  className="absolute inset-y-0 w-12 cursor-ew-resize group z-20"
                                  style={{
                                    left: `max(60px, min(${(trimEnd / videoDuration) * 100}%, calc(100% - 48px)))`,
                                  }}
                                  onPointerDown={(e) =>
                                    handleTrimHandlePointerDown(e, "end")
                                  }
                                >
                                  {/* Handle Line */}
                                  <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-purple-400 to-transparent" />
                                  
                                  {/* Handle Circle */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg border border-white/30 transition-all duration-200 group-hover:scale-110">
                                    <div className="absolute inset-0.5 rounded-full bg-white/40" />
                                  </div>
                                  
                                  {/* Handle Label */}
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                    <div className="bg-purple-500 text-white px-2 py-1 rounded text-xs font-medium shadow-lg">
                                      END
                                      <div className="text-purple-100 font-mono text-xs">{formatTime(trimEnd)}</div>
                                    </div>
                                  </div>
                                </div>

                                {/* Inverted Blur - Unselected Areas */}
                                <div
                                  className="absolute inset-y-0 left-0 bg-black/40 backdrop-blur-sm"
                                  style={{
                                    width: `${(trimStart / videoDuration) * 100}%`,
                                  }}
                                />
                                <div
                                  className="absolute inset-y-0 right-0 bg-black/40 backdrop-blur-sm"
                                  style={{
                                    width: `${
                                      ((videoDuration - trimEnd) / videoDuration) * 100
                                    }%`,
                                  }}
                                />
                                
                                {/* Clear Selected Area */}
                                <div
                                  className="absolute inset-y-0 border-y border-blue-400/30"
                                  style={{
                                    left: `${(trimStart / videoDuration) * 100}%`,
                                    width: `${((trimEnd - trimStart) / videoDuration) * 100}%`,
                                  }}
                                >
                                  {/* Duration Label */}
                                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white font-medium">
                                    {formatTime(trimEnd - trimStart)}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Simple Time Info */}
                          <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                            <span>{formatTime(trimStart)}</span>
                            <span className="text-zinc-300 font-medium">
                              {formatTime(trimEnd - trimStart)}
                            </span>
                            <span>{formatTime(trimEnd)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
