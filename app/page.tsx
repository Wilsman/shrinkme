import { LatestCommitPill } from "@/components/latest-commit-pill"
import { VideoCompressor } from "@/components/video-compressor"

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <LatestCommitPill />
        </div>
      </div>
      <VideoCompressor />
    </main>
  )
}
