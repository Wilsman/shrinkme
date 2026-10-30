// Size-targeted GIF compression on top of gifsicle (WASM) running in workers.
//
// For GIFs, output size tracks pixel count closely (size ~ scale^2), so instead
// of walking through fixed presets we predict the resize width that fits the
// target, try it alongside a safer fallback in parallel, and refine the
// prediction from real results. Lossy compression is roughly 2x slower and
// adds noise, so it is only used once resizing alone would go too small.

type WorkerResponse =
  | { id: number; ok: true; output: Uint8Array<ArrayBuffer>; stderr: string[] }
  | { id: number; ok: false; error: string };

type PendingJob = {
  id: number;
  inputKey: string;
  file: Blob;
  args: string[];
  resolve: (output: Uint8Array<ArrayBuffer>) => void;
  reject: (error: Error) => void;
};

const WORKER_URL = "/gifsicle-worker.js";

const abortError = () => new DOMException("GIF compression attempt cancelled", "AbortError");

class GifsiclePool {
  private idle: Worker[] = [];
  private all: Worker[] = [];
  private queue: PendingJob[] = [];
  private running = new Map<number, { job: PendingJob; worker: Worker }>();
  private nextId = 1;

  constructor(private readonly size: number) {}

  warmup() {
    this.ensureWorkers();
    this.all.forEach((worker) => worker.postMessage({ type: "warmup" }));
  }

  run(file: Blob, inputKey: string, args: string[], signal?: AbortSignal) {
    this.ensureWorkers();
    return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const job: PendingJob = { id: this.nextId++, inputKey, file, args, resolve, reject };
      // gifsicle can't be interrupted mid-run, so cancelling a running job
      // means replacing its worker.
      signal?.addEventListener(
        "abort",
        () => {
          const queuedIndex = this.queue.indexOf(job);
          if (queuedIndex >= 0) {
            this.queue.splice(queuedIndex, 1);
            reject(abortError());
            return;
          }
          const entry = this.running.get(job.id);
          if (entry) this.retire(entry.worker, abortError());
        },
        { once: true }
      );
      this.queue.push(job);
      this.pump();
    });
  }

  private ensureWorkers() {
    while (this.all.length < this.size) {
      const worker = new Worker(WORKER_URL);
      worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
        this.handleMessage(worker, event.data);
      worker.onerror = (event) => this.handleCrash(worker, event.message);
      this.all.push(worker);
      this.idle.push(worker);
    }
  }

  private pump() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.running.set(job.id, { job, worker });
      worker.postMessage({
        id: job.id,
        inputKey: job.inputKey,
        file: job.file,
        args: job.args,
      });
    }
  }

  private handleMessage(worker: Worker, message: WorkerResponse) {
    const entry = this.running.get(message.id);
    if (!entry) return;
    this.running.delete(message.id);
    this.idle.push(worker);

    if (message.ok) {
      entry.job.resolve(message.output);
    } else {
      entry.job.reject(new Error(message.error));
    }
    this.pump();
  }

  // A worker that runs out of memory dies without replying. Replace it and
  // fail the job it was running.
  private handleCrash(worker: Worker, reason: string) {
    this.retire(worker, new Error(reason || "gifsicle worker crashed"));
  }

  private retire(worker: Worker, error: Error) {
    worker.terminate();
    this.all = this.all.filter((candidate) => candidate !== worker);
    this.idle = this.idle.filter((candidate) => candidate !== worker);
    for (const [id, entry] of this.running) {
      if (entry.worker === worker) {
        this.running.delete(id);
        entry.job.reject(error);
      }
    }
    this.ensureWorkers();
    this.pump();
  }
}

let pool: GifsiclePool | null = null;

const getPool = () => {
  if (!pool) {
    // Two parallel candidates per round. Each worker holds a copy of the input
    // plus gifsicle's working memory, so more workers mostly costs RAM.
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    pool = new GifsiclePool(cores >= 4 ? 2 : 1);
  }
  return pool;
};

export const warmupGifsicle = () => {
  if (typeof window !== "undefined") getPool().warmup();
};

export const readGifDimensions = async (file: Blob) => {
  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  const signature = String.fromCharCode(...header.slice(0, 6));
  if (!signature.startsWith("GIF")) {
    throw new Error("File is not a GIF.");
  }
  return {
    width: header[6] | (header[7] << 8),
    height: header[8] | (header[9] << 8),
  };
};

type Candidate = {
  label: string;
  width: number;
  lossy: number;
  args: string[];
};

export type GifCompressionProgress = {
  round: number;
  maxRounds: number;
  description: string;
};

export type GifCompressionResult = {
  blob: Blob;
  width: number;
  label: string;
  metTarget: boolean;
  rounds: number;
};

const MAX_ROUNDS = 4;
const TARGET_HEADROOM = 0.97;
const MIN_WIDTH = 320;
// Second candidate in each round, as a fraction of the predicted width.
const FALLBACK_WIDTH_RATIO = 0.88;

const resizeCandidate = (sourceWidth: number, width: number): Candidate => {
  if (width >= sourceWidth) {
    return { label: "original size", width: sourceWidth, lossy: 0, args: ["-O2"] };
  }
  return {
    label: `${width}px wide`,
    width,
    lossy: 0,
    args: ["--resize-width", String(width)],
  };
};

const lossyCandidate = (
  sourceWidth: number,
  width: number,
  lossy: number,
  colors?: number
): Candidate => {
  const args = ["-O2", `--lossy=${lossy}`];
  if (colors) args.push("--colors", String(colors));
  if (width < sourceWidth) args.push("--resize-width", String(width));
  return {
    label: `${Math.min(width, sourceWidth)}px wide, lossy ${lossy}`,
    width: Math.min(width, sourceWidth),
    lossy,
    args,
  };
};

type RoundResult = { candidate: Candidate; blob: Blob };

// Runs a round's candidates in parallel. Candidates are ordered from highest
// quality (largest output) to lowest, so the round can end early:
// - a candidate fits and every better one missed -> it wins, cancel the rest
// - a candidate misses -> every better one would miss too, cancel them
const runRound = (
  candidates: Candidate[],
  targetBytes: number,
  run: (candidate: Candidate, signal: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>
) =>
  new Promise<{ results: RoundResult[]; winner: RoundResult | null }>((resolve, reject) => {
    const controllers = candidates.map(() => new AbortController());
    const outcomes: Array<RoundResult | "failed" | undefined> = candidates.map(() => undefined);
    const errors: unknown[] = [];
    let done = false;

    const settle = () => {
      if (done) return;
      const results = outcomes.filter((outcome): outcome is RoundResult =>
        Boolean(outcome && outcome !== "failed")
      );
      const missedAt = (index: number) =>
        outcomes.some(
          (outcome, other) =>
            other >= index && outcome && outcome !== "failed" && outcome.blob.size > targetBytes
        ) || outcomes[index] === "failed";

      for (let index = 0; index < candidates.length; index += 1) {
        const outcome = outcomes[index];
        if (outcome && outcome !== "failed" && outcome.blob.size <= targetBytes) {
          finish(results, outcome);
          return;
        }
        if (!missedAt(index)) return; // still waiting on a better candidate
      }

      if (results.length === 0) {
        done = true;
        controllers.forEach((controller) => controller.abort());
        reject(errors[0] instanceof Error ? errors[0] : new Error(String(errors[0])));
        return;
      }
      finish(results, null);
    };

    const finish = (results: RoundResult[], winner: RoundResult | null) => {
      done = true;
      controllers.forEach((controller, index) => {
        if (outcomes[index] === undefined) controller.abort();
      });
      resolve({ results, winner });
    };

    candidates.forEach((candidate, index) => {
      run(candidate, controllers[index].signal).then(
        (output) => {
          outcomes[index] = { candidate, blob: new Blob([output], { type: "image/gif" }) };
          settle();
        },
        (error) => {
          if (done) return;
          outcomes[index] = "failed";
          errors.push(error);
          settle();
        }
      );
    });
  });

export type GifsicleRunner = (
  file: Blob,
  inputKey: string,
  args: string[],
  signal?: AbortSignal
) => Promise<Uint8Array<ArrayBuffer>>;

const runInWorkerPool: GifsicleRunner = (file, inputKey, args, signal) =>
  getPool().run(file, inputKey, args, signal);

export async function compressGif(
  file: File,
  targetBytes: number,
  onProgress?: (progress: GifCompressionProgress) => void,
  runGifsicle: GifsicleRunner = runInWorkerPool
): Promise<GifCompressionResult> {
  const { width: sourceWidth } = await readGifDimensions(file);
  const budget = targetBytes * TARGET_HEADROOM;
  const minWidth = Math.min(sourceWidth, MIN_WIDTH);
  const inputKey = `${file.name}:${file.size}:${file.lastModified}`;

  // Bytes at full resolution, re-estimated from each round's results.
  let fullSizeEstimate = file.size;
  let lossyLevel = 0;
  let best: { blob: Blob; candidate: Candidate } | null = null;
  const tried = new Set<string>();

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const predictedScale = Math.sqrt(budget / fullSizeEstimate);
    const predictedWidth = Math.round(sourceWidth * Math.min(1, predictedScale));

    let candidates: Candidate[];
    if (lossyLevel === 0 && predictedWidth >= minWidth) {
      // Treat "almost full size" as full size: a 2% resize only blurs.
      const primaryWidth = predictedWidth >= sourceWidth * 0.98 ? sourceWidth : predictedWidth;
      candidates = [
        resizeCandidate(sourceWidth, primaryWidth),
        primaryWidth === sourceWidth
          ? lossyCandidate(sourceWidth, sourceWidth, 30)
          : resizeCandidate(
              sourceWidth,
              Math.max(minWidth, Math.round(primaryWidth * FALLBACK_WIDTH_RATIO))
            ),
      ];
    } else {
      // Resizing alone can't reach the target without going too small.
      lossyLevel = lossyLevel === 0 ? 80 : Math.min(200, lossyLevel + 60);
      const width = Math.max(minWidth, predictedWidth);
      candidates = [
        lossyCandidate(sourceWidth, width, lossyLevel),
        lossyCandidate(
          sourceWidth,
          Math.max(minWidth, Math.round(width * FALLBACK_WIDTH_RATIO)),
          lossyLevel + 40,
          128
        ),
      ];
    }

    candidates = candidates.filter((candidate) => {
      const key = candidate.args.join(" ");
      if (tried.has(key)) return false;
      tried.add(key);
      return true;
    });
    if (candidates.length === 0) break;

    onProgress?.({
      round,
      maxRounds: MAX_ROUNDS,
      description: candidates.map((candidate) => candidate.label).join(" / "),
    });

    const { results, winner } = await runRound(
      candidates,
      targetBytes,
      (candidate, signal) => runGifsicle(file, inputKey, candidate.args, signal)
    );

    for (const result of results) {
      if (!best || result.blob.size < best.blob.size) best = result;
    }

    if (winner) {
      return {
        blob: winner.blob,
        width: winner.candidate.width,
        label: winner.candidate.label,
        metTarget: true,
        rounds: round,
      };
    }

    // Refine the full-size estimate from the closest non-lossy result.
    const resizeResults = results.filter((result) => result.candidate.lossy === 0);
    if (resizeResults.length > 0) {
      fullSizeEstimate = Math.max(
        ...resizeResults.map((result) => {
          const scale = result.candidate.width / sourceWidth;
          return result.blob.size / (scale * scale);
        })
      );
    } else if (best) {
      // Lossy round missed: aim lower next time.
      const scale = best.candidate.width / sourceWidth;
      fullSizeEstimate = (best.blob.size / (scale * scale)) * 1.1;
    }
  }

  if (!best) {
    throw new Error("gifsicle could not produce a compressed GIF.");
  }

  return {
    blob: best.blob,
    width: best.candidate.width,
    label: best.candidate.label,
    metTarget: best.blob.size <= targetBytes,
    rounds: MAX_ROUNDS,
  };
}
