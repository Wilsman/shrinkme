"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { UploadSurface } from "@/components/upload-surface";
import { VideoEditorShell } from "@/components/video-editor-shell";
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
  const [targetSizeMB, setTargetSizeMB] = useState<number>(10);
  const [compressionAttempt, setCompressionAttempt] = useState(0);
  const [currentQualityLevel, setCurrentQualityLevel] = useState<string>("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);

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
  const generatingThumbsRef = useRef(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const sourceObjectUrlRef = useRef<string | null>(null);
  const compressedObjectUrlRef = useRef<string | null>(null);
  const isGifInput = originalVideo?.type === "image/gif";
  const uploadAccept = "video/*,image/gif";

  const replaceVideoObjectUrl = (nextUrl: string | null) => {
    const previousUrl = sourceObjectUrlRef.current;
    if (previousUrl && previousUrl !== nextUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    sourceObjectUrlRef.current = nextUrl;
    setVideoObjectUrl(nextUrl);
  };

  const replaceCompressedVideoUrl = (nextUrl: string | null) => {
    const previousUrl = compressedObjectUrlRef.current;
    if (previousUrl && previousUrl !== nextUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    compressedObjectUrlRef.current = nextUrl;
    setCompressedVideo(nextUrl);
  };

  useEffect(() => {
    // Set ready state immediately since we're using browser APIs
    setIsReady(true);

    return () => {
      if (sourceObjectUrlRef.current) {
        URL.revokeObjectURL(sourceObjectUrlRef.current);
      }
      if (compressedObjectUrlRef.current) {
        URL.revokeObjectURL(compressedObjectUrlRef.current);
      }
    };
  }, []);

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
    if (!videoElement || !videoObjectUrl) return;

    if (isPlaying) {
      // If at the end of trim range, go back to start
      if (videoElement.currentTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }

      videoElement.play().catch((err) => {
        if (
          err?.name === "AbortError" ||
          err?.name === "NotSupportedError"
        ) {
          setIsPlaying(false);
          return;
        }
        console.error("Error playing video:", err);
        setIsPlaying(false);
      });
    } else {
      videoElement.pause();
    }
  }, [isPlaying, trimStart, trimEnd, videoObjectUrl]);

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

  const handleSelectedFile = (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isGif = file.type === "image/gif";

    if (!isVideo && !isGif) {
      setError("Please select a valid video or GIF file.");
      toast.error("Invalid file", {
        description: "Please select a valid video or GIF file",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    replaceVideoObjectUrl(objectUrl);
    setOriginalVideo(file);
    setOriginalSize(file.size);
    replaceCompressedVideoUrl(null);
    setCompressedSize(null);
    setError(null);
    setThumbnails([]);
    setCompressionAttempt(0);
    setCurrentQualityLevel("");
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    setIsPlaying(false);
    setIsDraggingFile(false);
    setRecordedMimeType(null);

    if (isGif) {
      setEncodeEngine("mediabunny");
    }

    toast.success(`${isGif ? "GIF" : "Video"} selected`, {
      description: `${file.name} • ${formatFileSize(file.size)}`,
    });
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
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
    if (!originalVideo) {
      setError("Please select a video or GIF file first.");
      return;
    }

    if (isGifInput) {
      if (encodeEngine !== "mediabunny") {
        setEncodeEngine("mediabunny");
        toast.message("GIF input uses Mediabunny", {
          description: "Browser recording is only available for video sources.",
        });
      }
      await compressWithMediabunny();
      return;
    }

    if (!videoPreviewRef.current) {
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
    replaceCompressedVideoUrl(null);
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

        replaceCompressedVideoUrl(compressedUrl);
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
      : `compressed-media.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset everything to start over with a new media file
  const resetCompressor = () => {
    // Reset all state
    setOriginalVideo(null);
    replaceVideoObjectUrl(null);
    replaceCompressedVideoUrl(null);
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
    setIsDraggingFile(false);

    toast.success("Ready for new media", {
      description: "Select a video or GIF to compress",
    });
  };

  // Compress using Mediabunny Conversion with automated quality iteration
  const compressWithMediabunny = async () => {
    if (!originalVideo) return;

    setIsCompressing(true);
    setError(null);
    replaceCompressedVideoUrl(null);
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
      // Probe dimensions once when a video element is available.
      const v = !isGifInput ? document.createElement("video") : null;
      if (v) {
        v.src = videoObjectUrl || URL.createObjectURL(originalVideo);
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          v.addEventListener("loadedmetadata", done, { once: true });
          if (v.readyState >= 1) resolve();
        });
      }

      const effectiveDuration = Math.max(
        0.01,
        isGifInput ? 1 : (trimEnd || videoDuration) - (trimStart || 0)
      );
      const audioBitsPerSecond =
        !isGifInput && effectiveDuration > 60 ? 96000 : 128000;

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

        let targetWidth: number | undefined;
        let targetHeight: number | undefined;
        if (v && v.videoWidth > 0 && v.videoHeight > 0) {
          targetWidth = Math.max(2, Math.floor(v.videoWidth * scaleFactor));
          targetHeight = Math.max(2, Math.floor(v.videoHeight * scaleFactor));
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
        }

        // Initialize conversion
        const conv = await MBConversion.init({
          input,
          output,
          trim:
            !isGifInput && videoDuration > 0
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
            forceTranscode: !isGifInput,
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
        replaceCompressedVideoUrl(bestResult.url);
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

  const resolvedTrimEnd = videoDuration > 0 ? trimEnd || videoDuration : 0;
  const reductionPercent =
    originalSize && compressedSize
      ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 100))
      : null;
  const sourcePreview = isGifInput ? videoObjectUrl : thumbnails[0] || videoObjectUrl;

  return (
    <div className="min-h-screen bg-[#111111] text-[#f3efe6]">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={uploadAccept}
        className="hidden"
      />

      {!originalVideo ? (
        <UploadSurface
          error={error}
          isDragging={isDraggingFile}
          isReady={isReady}
          onBrowse={handleUploadClick}
          onFileDrop={handleSelectedFile}
          onDraggingChange={setIsDraggingFile}
        />
      ) : (
        <VideoEditorShell
          compressedSize={compressedSize}
          compressedVideo={compressedVideo}
          compressionAttempt={compressionAttempt}
          currentQualityLevel={currentQualityLevel}
          currentTime={currentTime}
          encodeEngine={encodeEngine}
          engineOptions={engineOptions}
          error={error}
          filmstripRef={filmstripRef}
          formatOptions={formatOptions}
          formatTime={formatTime}
          isCompressing={isCompressing}
          isGifInput={isGifInput}
          isLooping={isLooping}
          isPlaying={isPlaying}
          originalFileName={originalVideo.name}
          originalSize={originalSize}
          outputFormat={outputFormat}
          playheadTime={currentTime}
          progress={progress}
          reductionPercent={reductionPercent}
          selectionDuration={Math.max(0, resolvedTrimEnd - trimStart)}
          sourcePreview={sourcePreview}
          targetSizeMB={targetSizeMB}
          targetSizeOptions={targetSizeOptions}
          thumbnails={thumbnails}
          trimEnd={resolvedTrimEnd}
          trimStart={trimStart}
          videoDuration={videoDuration}
          videoObjectUrl={videoObjectUrl}
          videoPreviewRef={videoPreviewRef}
          onCompress={compressVideo}
          onDownload={downloadCompressedVideo}
          onEncodeEngineChange={setEncodeEngine}
          onFrameStep={handleFrameStep}
          onOutputFormatChange={setOutputFormat}
          onReplaceSource={handleUploadClick}
          onResetCompressor={resetCompressor}
          onResetTrim={resetTrim}
          onTargetSizeChange={setTargetSizeMB}
          onTimelinePointerDown={handleTimelinePointerDown}
          onToggleLoop={() => setIsLooping((value) => !value)}
          onTogglePlayPause={togglePlayPause}
          onTrimHandlePointerDown={handleTrimHandlePointerDown}
          onVideoTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            setCurrentTime(nextTime);

            if (isLooping && isPlaying && nextTime >= resolvedTrimEnd) {
              event.currentTarget.currentTime = trimStart;
            }
          }}
        />
      )}
    </div>
  );
}
