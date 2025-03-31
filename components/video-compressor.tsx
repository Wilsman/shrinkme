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
import { Slider } from "@/components/ui/slider";
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

export function VideoCompressor() {
  const [isReady, setIsReady] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [originalVideo, setOriginalVideo] = useState<File | null>(null);
  const [compressedVideo, setCompressedVideo] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  // Trimmer is now always shown when a video is loaded
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState("mp4-h264");

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Handle video playback in the trimmer
  useEffect(() => {
    const videoElement = videoPreviewRef.current;
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      const newTime = videoElement.currentTime;
      setCurrentTime(newTime);

      // If video reaches trim end during playback, loop back to trim start
      if (isPlaying && newTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }
    };

    const handleLoadedMetadata = () => {
      const duration = videoElement.duration;
      setVideoDuration(duration);
      // Only set trim values if they haven't been set yet or are invalid
      if (trimStart === 0 && trimEnd === 0) {
        setTrimStart(0);
        setTrimEnd(duration);
      }
      // Ensure current time is within trim bounds
      if (
        videoElement.currentTime < trimStart ||
        videoElement.currentTime > trimEnd
      ) {
        videoElement.currentTime = trimStart;
      }
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);

    // If video is already loaded, call handleLoadedMetadata immediately
    if (videoElement.readyState >= 2) {
      handleLoadedMetadata();
    }

    return () => {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [isPlaying, trimStart, trimEnd]);

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

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      // Check if the file is a video
      if (!file.type.startsWith("video/")) {
        setError("Please select a valid video file.");
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

      // Reset trimming values
      setCurrentTime(0);
      setTrimStart(0);
      setTrimEnd(0);
      setIsPlaying(false);
    }
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

  // Handle trim range change
  const handleTrimRangeChange = (values: number[]) => {
    if (!videoPreviewRef.current || values.length !== 2) return;

    const minTrimDuration = 0.1; // Minimum 100ms trim duration
    const duration = videoPreviewRef.current.duration;

    let [newStart, newEnd] = values;

    // Ensure valid bounds
    newStart = Math.max(0, Math.min(newStart, duration - minTrimDuration));
    newEnd = Math.min(duration, Math.max(newEnd, newStart + minTrimDuration));

    setTrimStart(newStart);
    setTrimEnd(newEnd);

    // Adjust current time if it's outside new trim bounds
    const videoElement = videoPreviewRef.current;
    if (videoElement.currentTime < newStart) {
      videoElement.currentTime = newStart;
    } else if (videoElement.currentTime > newEnd) {
      videoElement.currentTime = newEnd;
    }
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
    if (!originalVideo || !videoObjectUrl) return;

    try {
      setIsCompressing(true);
      setProgress(0);
      setError(null);

      // Create video element to load the original video
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";

      // Set up video element
      video.src = videoObjectUrl;
      video.muted = true;

      // Wait for video metadata to load
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.currentTime = trimStart; // Start at trim point
          resolve();
        };
      });

      // Get video dimensions
      const { videoWidth, videoHeight } = video;

      // Calculate effective duration (after trimming)
      const effectiveDuration = trimEnd - trimStart;

      // Target size: 9.9MB in bits (slightly under to ensure we stay below 10MB)
      const TARGET_SIZE_BITS = 9.9 * 8 * 1024 * 1024;

      // Calculate target bitrate based on duration to achieve ~10MB file
      // Reserve 20% for audio and container overhead
      const videoTargetBits = TARGET_SIZE_BITS * 0.8;
      const targetVideoBitrate = Math.floor(
        videoTargetBits / effectiveDuration
      );

      // Ensure minimum quality (300kbps) and maximum quality (5Mbps)
      const videoBitsPerSecond = Math.max(
        300000,
        Math.min(targetVideoBitrate, 5000000)
      );

      console.log(
        `Trimmed duration: ${effectiveDuration}s, Target bitrate: ${
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

      // Set up MediaRecorder with calculated bitrate
      const stream = canvas.captureStream(fps);

      // IMPROVED AUDIO HANDLING
      // Create a new audio element to extract audio
      const audioElement = document.createElement("audio");
      audioElement.src = videoObjectUrl;
      audioElement.muted = false;

      // Create audio context and connect it to the stream
      const audioCtx = new AudioContext();
      const audioDestination = audioCtx.createMediaStreamDestination();

      // Connect audio element to the audio context
      const audioSource = audioCtx.createMediaElementSource(audioElement);
      audioSource.connect(audioDestination);

      // Also connect to audio context destination so we can hear it (optional)
      audioSource.connect(audioCtx.destination);

      // Add all audio tracks to the stream
      audioDestination.stream.getAudioTracks().forEach((track) => {
        stream.addTrack(track);
      });

      // Audio bitrate based on video length (longer videos get lower audio bitrate)
      const audioBitsPerSecond = effectiveDuration > 60 ? 96000 : 128000;

      // Configure MediaRecorder with calculated quality
      const options = {
        mimeType:
          outputFormat === "mp4-h264"
            ? "video/mp4;codecs=avc1"
            : "video/webm;codecs=vp9",
        videoBitsPerSecond: videoBitsPerSecond,
        audioBitsPerSecond: audioBitsPerSecond,
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Create compressed video blob
        const blob = new Blob(chunks, { type: "video/webm" });
        const compressedUrl = URL.createObjectURL(blob);

        // Check if we're under 10MB
        const finalSize = blob.size;
        const tenMB = 10 * 1024 * 1024;

        if (finalSize > tenMB) {
          console.warn(
            `Compressed size ${finalSize} is still over 10MB, would need further compression`
          );
          // We'll still use this result as it's the best we can do with one pass
        } else {
          console.log(
            `Successfully compressed to ${finalSize / (1024 * 1024)}MB (${(
              (finalSize / tenMB) *
              100
            ).toFixed(1)}% of 10MB limit)`
          );
        }

        setCompressedVideo(compressedUrl);
        setCompressedSize(finalSize);
        setIsCompressing(false);

        // Clean up
        audioElement.pause();
        video.pause();

        // Close audio context
        audioCtx.close();
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
            ((video.currentTime - trimStart) / effectiveDuration) * 100
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

      // Start playback of both video and audio from trim start
      video.currentTime = trimStart;
      audioElement.currentTime = trimStart;

      // Play both elements
      const playPromises = [video.play(), audioElement.play()];

      // Wait for both to start playing
      await Promise.all(playPromises);

      // Start drawing frames
      drawFrame();
    } catch (err) {
      setError(
        "Failed to compress video. Please try again with a different file."
      );
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
    a.download = originalVideo
      ? `compressed-${originalVideo.name.replace(/\.[^/.]+$/, "")}.${
          outputFormat.startsWith("mp4") ? "mp4" : "webm"
        }`
      : `compressed-video.${outputFormat.startsWith("mp4") ? "mp4" : "webm"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Video Compression Tool</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Wrap all CardContent children in a single div */}
        <div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {/* Wrap main content and tabs in a fragment */}
          <div
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary transition-colors"
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

            {!originalVideo ? (
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="mb-2 text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  MP4, MOV, AVI, WebM (Max 100MB)
                </p>
                <Button
                  onClick={handleUploadClick}
                  className="mt-4"
                  disabled={!isReady}
                >
                  Select Video
                </Button>
              </div>
            ) : (
              <div className="w-full space-y-4">
                <p className="text-center font-medium">{originalVideo.name}</p>

                {originalSize && (
                  <div className="text-center text-sm text-muted-foreground">
                    Original size: {formatFileSize(originalSize)}
                  </div>
                )}

                {/* Output format selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Output Format</label>
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background text-foreground"
                  >
                    {formatOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-muted-foreground">
                    {formatOptions.find((o) => o.value === outputFormat)?.pros}{" "}
                    |{formatOptions.find((o) => o.value === outputFormat)?.cons}
                  </div>
                </div>

                {/* Video Trimmer - Always visible when video is loaded */}
                {originalVideo &&
                  videoObjectUrl &&
                  !compressedVideo &&
                  !isCompressing && (
                    <div className="space-y-2">
                      <div className="space-y-4 p-4 border rounded-lg">
                        <div className="aspect-video bg-black rounded-lg overflow-hidden">
                          <video
                            ref={videoPreviewRef}
                            src={videoObjectUrl}
                            className="w-full h-full"
                            onClick={togglePlayPause}
                          />
                        </div>

                        <div className="space-y-2">
                          {/* Current time display */}
                          <div className="flex justify-between text-sm">
                            <span>Current: {formatTime(currentTime)}</span>
                            <span>Duration: {formatTime(videoDuration)}</span>
                          </div>

                          {/* Playback controls */}
                          <div className="flex justify-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleFrameStep(false)}
                              title="Previous frame"
                            >
                              <SkipBack className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={togglePlayPause}
                            >
                              {isPlaying ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleFrameStep(true)}
                              title="Next frame"
                            >
                              <SkipForward className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={resetTrim}
                              title="Reset trim"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Timeline slider */}
                          <div className="space-y-4">
                            <div className="relative pt-1">
                              <div className="flex items-center justify-center h-2">
                                <div className="absolute w-full">
                                  <Slider
                                    value={[trimStart, trimEnd]}
                                    min={0}
                                    max={videoDuration || 100} // Fallback to 100 if duration not loaded
                                    step={0.01}
                                    minStepsBetweenThumbs={0.1}
                                    onValueChange={handleTrimRangeChange}
                                    disabled={!videoDuration}
                                    className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Playback position indicator */}
                            <div
                              className="relative w-full h-1 bg-gray-200 dark:bg-gray-800 cursor-pointer"
                              onClick={(e) => {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const pos =
                                  (e.clientX - rect.left) / rect.width;
                                handleSeek(pos * videoDuration);
                              }}
                            >
                              <div
                                className="absolute h-full bg-primary/30"
                                style={{
                                  left: `${(trimStart / videoDuration) * 100}%`,
                                  width: `${
                                    ((trimEnd - trimStart) / videoDuration) *
                                    100
                                  }%`,
                                }}
                              />
                              <div
                                className="absolute w-1 h-3 bg-primary -top-1"
                                style={{
                                  left: `${
                                    (currentTime / videoDuration) * 100
                                  }%`,
                                  transform: "translateX(-50%)",
                                }}
                              />
                            </div>

                            {/* Trim range display */}
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Start: {formatTime(trimStart)}</span>
                              <span>
                                Duration: {formatTime(trimEnd - trimStart)}
                              </span>
                              <span>End: {formatTime(trimEnd)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {!compressedVideo && !isCompressing && (
                  <Button
                    onClick={compressVideo}
                    className="w-full"
                    disabled={!isReady || !originalVideo}
                  >
                    Compress Video
                  </Button>
                )}

                {isCompressing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="w-full" />
                    <p className="text-center text-sm text-muted-foreground">
                      Compressing... {progress}%
                    </p>
                  </div>
                )}

                {compressedVideo && compressedSize && (
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span>Original: {formatFileSize(originalSize!)}</span>
                      <span>Compressed: {formatFileSize(compressedSize)}</span>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      {originalSize && compressedSize && (
                        <span>
                          Reduced by{" "}
                          {Math.round(
                            (1 - compressedSize / originalSize) * 100
                          )}
                          %
                        </span>
                      )}
                    </div>

                    <Button
                      onClick={downloadCompressedVideo}
                      className="w-full"
                      variant="secondary"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Compressed Video
                    </Button>
                  </div>
                )}

                <Button
                  onClick={handleUploadClick}
                  variant="outline"
                  className="w-full"
                >
                  Select Different Video
                </Button>
              </div>
            )}
          </div>{" "}
          {/* End of main controls div */}
          {originalVideo && compressedVideo && (
            <Tabs defaultValue="original" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="original">Original</TabsTrigger>
                <TabsTrigger value="compressed">Compressed</TabsTrigger>
              </TabsList>
              <TabsContent value="original" className="mt-4">
                <video
                  src={videoObjectUrl!}
                  controls
                  className="w-full rounded-lg"
                />
              </TabsContent>
              <TabsContent value="compressed" className="mt-4">
                <video
                  src={compressedVideo}
                  controls
                  className="w-full rounded-lg"
                />
              </TabsContent>
            </Tabs>
          )}
        </div>{" "}
        {/* End of wrapper div */}
      </CardContent>
    </Card>
  );
}
