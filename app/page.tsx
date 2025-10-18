import { VideoCompressor } from "@/components/video-compressor"

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-4 max-w-[1600px] h-[calc(100vh-9rem)] flex flex-col relative">
      <VideoCompressor />
    </main>
  )
}

