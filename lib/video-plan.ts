// Picks bitrate, resolution and frame rate so a video fits a target file size.
//
// Size is set by bitrate x duration, so the bitrate comes straight from the
// budget. Resolution then follows from how many bits each pixel gets: too few
// bits at a high resolution looks worse than a clean lower resolution.

export type VideoCodecFamily = "avc" | "hevc" | "vp9" | "av1" | "vp8";

export type VideoPlanInput = {
  targetBytes: number;
  durationSeconds: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFrameRate: number;
  sourceBytes: number;
  sourceDurationSeconds: number;
  hasAudio: boolean;
  codec: VideoCodecFamily;
};

export type VideoPlan = {
  videoBitrate: number;
  audioBitrate: number;
  width: number;
  height: number;
  frameRate?: number;
};

// Muxing overhead plus encoder rate-control overshoot.
const SIZE_HEADROOM = 0.94;

// Rough bits-per-pixel-per-frame where each codec still looks clean.
const MIN_BITS_PER_PIXEL: Record<VideoCodecFamily, number> = {
  avc: 0.05,
  vp8: 0.055,
  hevc: 0.035,
  vp9: 0.035,
  av1: 0.028,
};

const HEIGHT_LADDER = [2160, 1440, 1080, 900, 720, 540, 480, 360, 240];
const MIN_VIDEO_BITRATE = 150_000;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const pickAudioBitrate = (budgetBits: number, durationSeconds: number) => {
  const preferred = durationSeconds > 120 ? 96_000 : 128_000;
  // Never let audio take more than ~12% of the budget.
  const cap = (budgetBits * 0.12) / durationSeconds;
  return Math.max(48_000, Math.min(preferred, Math.floor(cap / 8000) * 8000));
};

export function planVideoEncode(input: VideoPlanInput): VideoPlan {
  const duration = Math.max(0.1, input.durationSeconds);
  const budgetBits = input.targetBytes * 8 * SIZE_HEADROOM;
  const audioBitrate = input.hasAudio ? pickAudioBitrate(budgetBits, duration) : 0;

  let videoBitrate = Math.floor((budgetBits - audioBitrate * duration) / duration);

  // Don't spend more than the source used: it only makes the file bigger.
  const sourceBitrate =
    (input.sourceBytes * 8) / Math.max(0.1, input.sourceDurationSeconds);
  if (sourceBitrate > 0) videoBitrate = Math.min(videoBitrate, Math.floor(sourceBitrate));
  videoBitrate = Math.max(MIN_VIDEO_BITRATE, videoBitrate);

  const sourceFps = input.sourceFrameRate > 0 ? Math.min(input.sourceFrameRate, 120) : 30;
  const minBpp = MIN_BITS_PER_PIXEL[input.codec];
  const sourceShortSide = Math.min(input.sourceWidth, input.sourceHeight);

  const dimensionsFor = (shortSide: number) => {
    const scale = Math.min(1, shortSide / sourceShortSide);
    return {
      width: even(input.sourceWidth * scale),
      height: even(input.sourceHeight * scale),
    };
  };

  const fits = (shortSide: number, fps: number) => {
    const { width, height } = dimensionsFor(shortSide);
    return videoBitrate / (width * height * fps) >= minBpp;
  };

  const ladder = [
    sourceShortSide,
    ...HEIGHT_LADDER.filter((step) => step < sourceShortSide),
  ];

  // High-frame-rate sources keep full motion only while they can stay at
  // 720p or above; below that, 30 fps at a higher resolution looks better.
  if (sourceFps > 32) {
    const highFpsFloor = Math.min(720, sourceShortSide);
    const shortSide = ladder.find((step) => step >= highFpsFloor && fits(step, sourceFps));
    if (shortSide !== undefined) {
      return { videoBitrate, audioBitrate, ...dimensionsFor(shortSide) };
    }
  }

  const fps = Math.min(sourceFps, 30);
  const frameRate = fps < sourceFps ? fps : undefined;
  // Smallest rung if even that is under the quality floor.
  const shortSide = ladder.find((step) => fits(step, fps)) ?? ladder[ladder.length - 1];
  return { videoBitrate, audioBitrate, ...dimensionsFor(shortSide), frameRate };
}

// After an attempt overshoots, scale the video bitrate down by how far off it
// was, with a little extra margin.
export function correctVideoBitrate(
  plan: VideoPlan,
  actualBytes: number,
  targetBytes: number,
  durationSeconds: number
): number {
  const duration = Math.max(0.1, durationSeconds);
  const actualVideoBits = actualBytes * 8 - plan.audioBitrate * duration;
  const allowedVideoBits = targetBytes * 8 * 0.97 - plan.audioBitrate * duration;
  const ratio = allowedVideoBits / Math.max(1, actualVideoBits);
  return Math.max(MIN_VIDEO_BITRATE, Math.floor(plan.videoBitrate * ratio * 0.97));
}
