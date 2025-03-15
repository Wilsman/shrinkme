"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Upload, AlertCircle } from "lucide-react"
import { formatFileSize } from "@/lib/utils"

export function VideoCompressor() {
  const [isReady, setIsReady] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [originalVideo, setOriginalVideo] = useState<File | null>(null)
  const [compressedVideo, setCompressedVideo] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState<number | null>(null)
  const [compressedSize, setCompressedSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Set ready state immediately since we're using browser APIs
    setIsReady(true)
  }, [])

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]

      // Check if the file is a video
      if (!file.type.startsWith("video/")) {
        setError("Please select a valid video file.")
        return
      }

      setOriginalVideo(file)
      setOriginalSize(file.size)
      setCompressedVideo(null)
      setCompressedSize(null)
      setError(null)
    }
  }

  // Compress the video using MediaRecorder
  const compressVideo = async () => {
    if (!originalVideo) return

    try {
      setIsCompressing(true)
      setProgress(0)
      setError(null)

      // Create video element to load the original video
      const video = document.createElement("video")
      video.crossOrigin = "anonymous"

      // Create a URL for the video
      const videoURL = URL.createObjectURL(originalVideo)

      // Set up video element
      video.src = videoURL
      video.muted = true

      // Wait for video metadata to load
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.currentTime = 0 // Ensure we start at the beginning
          resolve()
        }
      })

      // Get video dimensions and duration
      const { videoWidth, videoHeight, duration } = video

      // Target size: 9.9MB in bits (slightly under to ensure we stay below 10MB)
      const TARGET_SIZE_BITS = 9.9 * 8 * 1024 * 1024

      // Calculate target bitrate based on duration to achieve ~10MB file
      // Reserve 20% for audio and container overhead
      const videoTargetBits = TARGET_SIZE_BITS * 0.8
      const targetVideoBitrate = Math.floor(videoTargetBits / duration)

      // Ensure minimum quality (300kbps) and maximum quality (5Mbps)
      const videoBitsPerSecond = Math.max(300000, Math.min(targetVideoBitrate, 5000000))

      console.log(`Video duration: ${duration}s, Target bitrate: ${videoBitsPerSecond / 1000}kbps`)

      // Calculate target resolution based on bitrate
      // Higher bitrate allows for higher resolution
      let scaleFactor = 1
      if (videoBitsPerSecond < 1000000) {
        // For low bitrates, reduce resolution more aggressively
        scaleFactor = 0.5
      } else if (videoBitsPerSecond < 2000000) {
        scaleFactor = 0.65
      } else if (videoBitsPerSecond < 3000000) {
        scaleFactor = 0.75
      } else {
        scaleFactor = 0.85
      }

      // Apply resolution scaling
      let targetWidth = Math.floor(videoWidth * scaleFactor)
      let targetHeight = Math.floor(videoHeight * scaleFactor)

      // Ensure dimensions are even (required by some codecs)
      targetWidth = targetWidth - (targetWidth % 2)
      targetHeight = targetHeight - (targetHeight % 2)

      // Cap maximum dimension to 1280px for very high-res videos
      const MAX_DIMENSION = 1280
      if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
        if (targetWidth > targetHeight) {
          const ratio = MAX_DIMENSION / targetWidth
          targetWidth = MAX_DIMENSION
          targetHeight = Math.floor(targetHeight * ratio)
        } else {
          const ratio = MAX_DIMENSION / targetHeight
          targetHeight = MAX_DIMENSION
          targetWidth = Math.floor(targetWidth * ratio)
        }
        // Ensure dimensions are even
        targetWidth = targetWidth - (targetWidth % 2)
        targetHeight = targetHeight - (targetHeight % 2)
      }

      console.log(
        `Original resolution: ${videoWidth}x${videoHeight}, Target resolution: ${targetWidth}x${targetHeight}`,
      )

      // Create canvas for processing frames
      const canvas = document.createElement("canvas")
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext("2d", { alpha: false }) // Disable alpha for better performance

      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      // Improved approach: Use requestVideoFrameCallback if available for better frame timing
      // or fallback to standard playback with MediaRecorder

      // Determine original video framerate (default to 30fps if can't be determined)
      let fps = 30

      // Try to get the actual framerate if possible
      try {
        await video.play()
        await new Promise((resolve) => setTimeout(resolve, 100)) // Let it play briefly
        video.pause()

        // Some browsers expose framerate info
        if ("getVideoPlaybackQuality" in video) {
          const quality = (video as any).getVideoPlaybackQuality()
          if (quality && quality.totalVideoFrames > 0) {
            fps = Math.min(60, Math.max(24, Math.round(quality.totalVideoFrames / duration)))
          }
        }
      } catch (e) {
        console.warn("Could not determine framerate:", e)
      }

      console.log(`Using framerate: ${fps}fps`)

      // Set up MediaRecorder with calculated bitrate
      const stream = canvas.captureStream(fps)

      // IMPROVED AUDIO HANDLING
      // Create a new audio element to extract audio
      const audioElement = document.createElement("audio")
      audioElement.src = videoURL
      audioElement.muted = false

      // Create audio context and connect it to the stream
      const audioCtx = new AudioContext()
      const audioDestination = audioCtx.createMediaStreamDestination()

      // Connect audio element to the audio context
      const audioSource = audioCtx.createMediaElementSource(audioElement)
      audioSource.connect(audioDestination)

      // Also connect to audio context destination so we can hear it (optional)
      audioSource.connect(audioCtx.destination)

      // Add all audio tracks to the stream
      audioDestination.stream.getAudioTracks().forEach((track) => {
        stream.addTrack(track)
      })

      // Audio bitrate based on video length (longer videos get lower audio bitrate)
      const audioBitsPerSecond = duration > 60 ? 96000 : 128000

      // Configure MediaRecorder with calculated quality
      const options = {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: videoBitsPerSecond,
        audioBitsPerSecond: audioBitsPerSecond,
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        // Create compressed video blob
        const blob = new Blob(chunks, { type: "video/webm" })
        const compressedUrl = URL.createObjectURL(blob)

        // Check if we're under 10MB
        const finalSize = blob.size
        const tenMB = 10 * 1024 * 1024

        if (finalSize > tenMB) {
          console.warn(`Compressed size ${finalSize} is still over 10MB, would need further compression`)
          // We'll still use this result as it's the best we can do with one pass
        } else {
          console.log(
            `Successfully compressed to ${finalSize / (1024 * 1024)}MB (${((finalSize / tenMB) * 100).toFixed(1)}% of 10MB limit)`,
          )
        }

        setCompressedVideo(compressedUrl)
        setCompressedSize(finalSize)
        setIsCompressing(false)

        // Clean up
        audioElement.pause()
        video.pause()
        URL.revokeObjectURL(videoURL)

        // Close audio context
        audioCtx.close()
      }

      // Start recording
      mediaRecorder.start(100) // Collect data in 100ms chunks

      // IMPROVED FRAME PROCESSING
      // Instead of manually seeking through the video, we'll play it normally
      // and capture frames as it plays, which should maintain proper timing and audio sync

      // Draw function to update the canvas with the current video frame
      const drawFrame = () => {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

        // Update progress based on current time
        const progressPercent = Math.min(100, Math.round((video.currentTime / duration) * 100))
        setProgress(progressPercent)

        // Continue drawing frames until the video ends
        if (!video.ended && !video.paused) {
          requestAnimationFrame(drawFrame)
        } else {
          // Video playback ended
          mediaRecorder.stop()
        }
      }

      // Start playback of both video and audio
      video.currentTime = 0
      audioElement.currentTime = 0

      // Play both elements
      const playPromises = [video.play(), audioElement.play()]

      // Wait for both to start playing
      await Promise.all(playPromises)

      // Start drawing frames
      drawFrame()

      // Set up ended event to stop recording when video ends
      video.onended = () => {
        mediaRecorder.stop()
      }
    } catch (err) {
      setError("Failed to compress video. Please try again with a different file.")
      console.error(err)
      setIsCompressing(false)
    }
  }

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Download the compressed video
  const downloadCompressedVideo = () => {
    if (!compressedVideo) return

    const a = document.createElement("a")
    a.href = compressedVideo
    a.download = originalVideo
      ? `compressed-${originalVideo.name.replace(/\.[^/.]+$/, "")}.webm`
      : "compressed-video.webm"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Video Compression Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />

          {!originalVideo ? (
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="mb-2 text-sm text-muted-foreground">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground">MP4, MOV, AVI, WebM (Max 100MB)</p>
              <Button onClick={handleUploadClick} className="mt-4" disabled={!isReady}>
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

              {!compressedVideo && !isCompressing && (
                <Button onClick={compressVideo} className="w-full" disabled={!isReady || !originalVideo}>
                  Compress Video
                </Button>
              )}

              {isCompressing && (
                <div className="space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-center text-sm text-muted-foreground">Compressing... {progress}%</p>
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
                      <span>Reduced by {Math.round((1 - compressedSize / originalSize) * 100)}%</span>
                    )}
                  </div>

                  <Button onClick={downloadCompressedVideo} className="w-full" variant="secondary">
                    <Download className="mr-2 h-4 w-4" />
                    Download Compressed Video
                  </Button>
                </div>
              )}

              <Button onClick={handleUploadClick} variant="outline" className="w-full">
                Select Different Video
              </Button>
            </div>
          )}
        </div>

        {originalVideo && compressedVideo && (
          <Tabs defaultValue="original" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="original">Original</TabsTrigger>
              <TabsTrigger value="compressed">Compressed</TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              <video src={URL.createObjectURL(originalVideo)} controls className="w-full rounded-lg" />
            </TabsContent>
            <TabsContent value="compressed" className="mt-4">
              <video src={compressedVideo} controls className="w-full rounded-lg" />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="flex justify-between text-sm text-muted-foreground">
        <p>Compression is done entirely in your browser</p>
      </CardFooter>
    </Card>
  )
}

