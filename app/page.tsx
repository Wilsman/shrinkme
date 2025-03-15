import { VideoCompressor } from "@/components/video-compressor"

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-8">Video Compressor</h1>
      <p className="text-center mb-8 text-muted-foreground">
        Upload a video file and compress it to reduce its size while maintaining reasonable quality.
      </p>
      <VideoCompressor />
    </main>
  )
}

