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
} from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
// Mediabunny for faster conversion
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
    if (targetEl.closest('.timeline-slider') || targetEl.closest('[role="slider"]')) return;

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
      const TARGET_SIZE_BITS = (targetSizeMB * 0.93) * 8 * 1024 * 1024;

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
        const actualType = mediaRecorder.mimeType || (chunks[0]?.type || "video/webm");

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
        const reduction = original > 0 ? Math.round((1 - finalSize / original) * 100) : null;
        toast.success("Compression complete", {
          id: "compress",
          description:
            original && reduction !== null
              ? `${formatFileSize(original)} → ${formatFileSize(finalSize)} • ${reduction}% smaller`
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
    const ext = recordedMimeType?.includes("mp4")
      ? "mp4"
      : "webm";
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

      const effectiveDuration = Math.max(0.01, (trimEnd || videoDuration) - (trimStart || 0));
      const audioBitsPerSecond = effectiveDuration > 60 ? 96000 : 128000;

      // Iterate through quality levels from highest to lowest
      for (let i = 0; i < qualityLevels.length; i++) {
        const { name, quality } = qualityLevels[i];
        setCompressionAttempt(i + 1);
        setCurrentQualityLevel(name);
        setProgress(0);

        toast.loading("Converting…", {
          id: "compress",
          description: `Attempt ${i + 1}/${qualityLevels.length}: ${name} quality`,
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
              ? { start: Math.max(0, trimStart), end: Math.min(videoDuration, trimEnd || videoDuration) }
              : undefined,
          video: {
            codec: outputFormat === "mp4-h264" ? ("avc" as any) : ("vp9" as any),
            bitrate: quality as any,
            width: targetWidth || undefined,
            forceTranscode: true,
          },
          audio: {
            codec: outputFormat === "mp4-h264" ? ("aac" as any) : ("opus" as any),
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
            description: `Attempt ${i + 1}/${qualityLevels.length}: ${name} - ${pct}%`,
            duration: Infinity,
          });
        };

        // Execute conversion
        await conv.execute();

        const buffer = target.buffer as ArrayBuffer;
        const mime = outputFormat === "mp4-h264" ? "video/mp4" : "video/webm";
        const blob = new Blob([buffer], { type: mime });
        lastAttemptSize = blob.size;

        console.log(`Attempt ${i + 1} (${name}): ${formatFileSize(blob.size)} / ${formatFileSize(targetBytes)} target`);

        // Check if this result meets the target size
        if (blob.size <= targetBytes) {
          // Success! This quality level produces a file under the target size
          const url = URL.createObjectURL(blob);
          bestResult = { blob, url, quality: name };
          
          toast.success("Compression complete", {
            id: "compress",
            description: `${formatFileSize(blob.size)} with ${name} quality (${i + 1}/${qualityLevels.length} attempts)`,
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
              description: `${formatFileSize(blob.size)} (exceeds ${targetSizeMB}MB target, used lowest quality)`,
            });
          } else {
            // Continue to next quality level
            console.log(`File too large (${formatFileSize(blob.size)}), trying lower quality...`);
          }
        }
      }

      // Apply the best result
      if (bestResult) {
        setCompressedVideo(bestResult.url);
        setCompressedSize(bestResult.blob.size);
        setRecordedMimeType(outputFormat === "mp4-h264" ? "video/mp4" : "video/webm");
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
    <>
      {/* Title Badge - Only show when video is loaded */}
      {originalVideo && (
        <div className="absolute top-4 left-4 z-10">
          <div className="bg-background/80 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-lg">
            <h1 className="text-sm font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Video Compressor
            </h1>
          </div>
        </div>
      )}

      {!originalVideo ? (
        // Initial Clean View - Just the drop area
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-2xl p-16 border-2 border-dashed rounded-2xl hover:border-primary transition-all duration-300 bg-muted/30 ring-1 ring-border hover:ring-primary/50 cursor-pointer"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.add("border-primary");
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.remove("border-primary");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.remove("border-primary");

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
              <Upload className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <p className="mb-2 text-lg font-medium text-foreground">
                Drop a video here
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                or click below to select
              </p>
              <Button
                onClick={handleUploadClick}
                className="mt-2"
                size="lg"
                disabled={!isReady}
                aria-label="Select video to upload"
              >
                <Upload className="mr-2 h-5 w-5" />
                Select Video
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Supports MP4, MOV, AVI, WebM
              </p>
            </div>
          </div>
        </div>
      ) : (
        // Two-column layout when video is loaded
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Left Column - Controls */}
          <Card className="w-[420px] flex-shrink-0 overflow-hidden border-muted-foreground/20 shadow-xl bg-gradient-to-b from-background to-muted/30">
            <CardHeader className="pt-10 pb-3">
              <CardTitle className="text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[calc(100vh-16rem)]">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="w-full space-y-4">
                <div className="text-center space-y-1">
                  <p className="font-medium truncate" title={originalVideo.name}>{originalVideo.name}</p>
                  {originalSize && (
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-muted px-2 py-0.5">Original: {formatFileSize(originalSize)}</span>
                    </div>
                  )}
                </div>

                {/* Encoder and quality/format selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Encoder</label>
                  <Select value={encodeEngine} onValueChange={(v) => setEncodeEngine(v as any)}>
                    <SelectTrigger aria-label="Select encoder engine">
                      <SelectValue placeholder="Select encoder" />
                    </SelectTrigger>
                    <SelectContent>
                      {engineOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} — {option.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {encodeEngine === "mediabunny" && (
                    <div className="text-xs text-muted-foreground">
                      Automatically finds the best quality to meet your target size.
                    </div>
                  )}

                  <label className="text-sm font-medium mt-4 block">Target Size</label>
                  <Select value={targetSizeMB.toString()} onValueChange={(v) => setTargetSizeMB(Number(v))}>
                    <SelectTrigger aria-label="Select target size">
                      <SelectValue placeholder="Select target size" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetSizeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Output will be compressed to stay under {targetSizeMB} MB (approximately {(targetSizeMB * 0.93).toFixed(1)} MB)
                  </div>

                  <label className="text-sm font-medium mt-4 block">Output Format</label>
                  <Select value={outputFormat} onValueChange={setOutputFormat}>
                    <SelectTrigger aria-label="Select output format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      {formatOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} — {option.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    {formatOptions.find((o) => o.value === outputFormat)?.pros} |
                    {formatOptions.find((o) => o.value === outputFormat)?.cons}
                  </div>
                </div>

                {!compressedVideo && !isCompressing && (
                  <Button
                    onClick={compressVideo}
                    className="w-full"
                    disabled={!isReady || !originalVideo}
                    aria-label="Compress video"
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    Compress Video
                  </Button>
                )}

                {isCompressing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="w-full" />
                    <p className="text-center text-sm text-muted-foreground">
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
                    <div className="flex items-center justify-between text-sm">
                      <span className="rounded-md bg-muted px-2 py-0.5">Original: {formatFileSize(originalSize!)}</span>
                      <span className="rounded-md bg-muted px-2 py-0.5">Compressed: {formatFileSize(compressedSize)}</span>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      {originalSize && compressedSize && (
                        <span className="rounded-md bg-emerald-500/10 text-emerald-500 px-2 py-0.5">
                          Reduced by {Math.round((1 - compressedSize / originalSize) * 100)}%
                        </span>
                      )}
                    </div>

                    <Button
                      onClick={downloadCompressedVideo}
                      className="w-full"
                      variant="secondary"
                      aria-label="Download compressed video"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Compressed Video
                    </Button>

                    <Button
                      onClick={resetCompressor}
                      variant="outline"
                      className="w-full"
                      aria-label="Compress another video"
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
                    className="w-full"
                    aria-label="Select a different video"
                  >
                    Select Different Video
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Video Preview & Trimmer */}
          <Card className="flex-1 overflow-hidden border-muted-foreground/20 shadow-xl bg-gradient-to-b from-background to-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                {compressedVideo ? "Preview" : "Video Preview & Trim"}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100vh-18rem)] flex flex-col">
              {!originalVideo ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Upload className="mx-auto h-16 w-16 mb-4 opacity-50" />
                    <p>Upload a video to get started</p>
                  </div>
                </div>
              ) : compressedVideo ? (
                <Tabs defaultValue="compressed" className="flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="original">Original</TabsTrigger>
                    <TabsTrigger value="compressed">Compressed</TabsTrigger>
                  </TabsList>
                  <TabsContent value="original" className="flex-1 mt-0">
                    <video
                      src={videoObjectUrl!}
                      controls
                      className="w-full h-full rounded-lg object-contain bg-black"
                      playsInline
                    />
                  </TabsContent>
                  <TabsContent value="compressed" className="flex-1 mt-0">
                    <video
                      src={compressedVideo}
                      controls
                      className="w-full h-full rounded-lg object-contain bg-black"
                      playsInline
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex-1 flex flex-col space-y-3">
                  <div className="flex-1 bg-black rounded-xl overflow-hidden ring-1 ring-border">
                    <video
                      ref={videoPreviewRef}
                      src={videoObjectUrl!}
                      className="w-full h-full object-contain"
                      playsInline
                      onClick={togglePlayPause}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    />
                  </div>

                  <div className="space-y-3">
                    {/* Timecodes */}
                    <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground font-mono tabular-nums">
                      <span>Current: {formatTime(currentTime)}</span>
                      <span>Duration: {formatTime(videoDuration)}</span>
                    </div>

                    {/* Playback controls */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => handleFrameStep(false)}
                        title="Previous frame"
                        aria-label="Previous frame"
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="default"
                        onClick={togglePlayPause}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => handleFrameStep(true)}
                        title="Next frame"
                        aria-label="Next frame"
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={resetTrim}
                        title="Reset trim"
                        aria-label="Reset trim"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Timeline: separate scrubber + filmstrip with handles */}
                    <div className="space-y-2">
                      {/* Scrubber */}
                      <div
                        className="relative w-full select-none cursor-pointer py-2"
                        onPointerDown={handleTimelinePointerDown}
                      >
                        <div className="h-1 w-full rounded-full bg-muted-foreground/20" />
                        {videoDuration > 0 && (
                          <div
                            className="pointer-events-none absolute top-1/2 z-20 h-5 w-px -translate-y-1/2 bg-foreground"
                            style={{ left: `${(currentTime / videoDuration) * 100}%` }}
                          />
                        )}
                      </div>

                      {/* Filmstrip with handles */}
                      <div
                        ref={filmstripRef}
                        className="relative w-full h-16 rounded-md overflow-hidden bg-muted/20 ring-1 ring-border"
                      >
                    <div className="flex h-full w-full">
                      {thumbnails.length > 0
                        ? thumbnails.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt="thumb"
                              className="h-full w-[96px] flex-none object-cover select-none"
                              draggable={false}
                            />
                          ))
                        : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              Generating preview…
                            </div>
                          )}
                    </div>

                    {/* Overlays to dim outside selection */}
                    {videoDuration > 0 && (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-background/70"
                          style={{ width: `${(trimStart / videoDuration) * 100}%` }}
                        />
                        <div
                          className="absolute inset-y-0 right-0 bg-background/70"
                          style={{ width: `${((videoDuration - trimEnd) / videoDuration) * 100}%` }}
                        />
                        {/* Selection outline */}
                        <div
                          className="pointer-events-none absolute inset-y-0 border-2 border-foreground/60"
                          style={{
                            left: `${(trimStart / videoDuration) * 100}%`,
                            width: `${((trimEnd - trimStart) / videoDuration) * 100}%`,
                          }}
                        />
                        {/* Start handle */}
                        <div
                          role="button"
                          aria-label="Trim start"
                          className="absolute inset-y-0 -translate-x-1/2 w-6 cursor-ew-resize z-20"
                          style={{ left: `${(trimStart / videoDuration) * 100}%` }}
                          onPointerDown={(e) => handleTrimHandlePointerDown(e, "start")}
                        >
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 bg-foreground/90 shadow-sm" />
                        </div>
                        {/* End handle */}
                        <div
                          role="button"
                          aria-label="Trim end"
                          className="absolute inset-y-0 -translate-x-1/2 w-6 cursor-ew-resize z-20"
                          style={{ left: `${(trimEnd / videoDuration) * 100}%` }}
                          onPointerDown={(e) => handleTrimHandlePointerDown(e, "end")}
                        >
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 bg-foreground/90 shadow-sm" />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Trim chips */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-mono tabular-nums">
                    <span className="rounded-md bg-muted px-2 py-1">Start: {formatTime(trimStart)}</span>
                    <span className="rounded-md bg-muted px-2 py-1">Duration: {formatTime(trimEnd - trimStart)}</span>
                    <span className="rounded-md bg-muted px-2 py-1">End: {formatTime(trimEnd)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      )}
    </>
  );
}
