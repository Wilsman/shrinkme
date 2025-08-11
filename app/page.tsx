import { VideoCompressor } from "@/components/video-compressor"

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="text-center text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
        Video Compressor
      </h1>
      <p className="mx-auto max-w-2xl text-center mb-8 text-muted-foreground">
        Trim and compress your video quickly. Targets under 10MB for easy Discord sharing.
      </p>
      <VideoCompressor />
    </main>
  )
}

