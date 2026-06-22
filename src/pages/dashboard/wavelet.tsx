import type { NextPage } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Container,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';

const API_BASE = process.env.NEXT_PUBLIC_ESP32_API_BASE_URL ?? 'http://localhost:8000';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Aggregate {
  bucket_start: string;
  temp_f_avg: number | null;
  rh_avg: number | null;
}

interface WeatherRow {
  bucket_start: string;
  temp_c_avg:     number | null;
  dewpoint_c_avg: number | null;
  rh_avg:         number | null;
}

interface ExternalStats {
  tempMean: number; tempStd: number;
  dpMean:   number; dpStd:   number;
  n: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_SCALES = 50;
const MIN_PERIOD = 6;    // hours
const MAX_PERIOD = 240;  // hours
// Morlet oscillation parameter — w0=6 is the standard geophysics choice (Torrence & Compo 1998)
const W0 = 6;
const DISPLAY_TZ = 'America/Los_Angeles';

// Magnus formula: converts temperature (°F) + relative humidity (%) → dew point (°F)
function rhToDewPoint(tempF: number, rh: number): number {
  const Tc    = (tempF - 32) * 5 / 9;
  const clampedRh = Math.max(1, Math.min(100, rh));
  const gamma = Math.log(clampedRh / 100) + 17.625 * Tc / (243.04 + Tc);
  return (243.04 * gamma / (17.625 - gamma)) * 9 / 5 + 32;
}

// Returns the UTC timestamp of midnight in DISPLAY_TZ on the 1st of month0 (0-indexed) in year.
// PST=UTC-8, PDT=UTC-7: noon UTC is always 4am or 5am in LA, so subtracting hourInTZ from noon gives midnight.
function tzMonthStart(year: number, month0: number): Date {
  const noon = new Date(Date.UTC(year, month0, 1, 12));
  const hourInTZ = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, hour: 'numeric', hour12: false }).format(noon)
  );
  return new Date(noon.getTime() - hourInTZ * 3_600_000);
}

const SCALES: number[] = Array.from({ length: NUM_SCALES }, (_, i) => {
  const t = i / (NUM_SCALES - 1);
  return MIN_PERIOD * Math.pow(MAX_PERIOD / MIN_PERIOD, t);
});

const CANVAS_HEIGHT = 280;
const Y_TICKS = [6, 12, 24, 48, 72, 168, 240];
const REF_PERIODS = [12, 24, 48, 72, 168];

const AUDIO_DURATION    = 30;    // seconds of playback for the full dataset
const AUDIO_SAMPLE_RATE = 44100; // Hz
const AUDIO_F_MIN       = 80;    // Hz — longest period (240 h) → lowest pitch
const AUDIO_F_MAX       = 4000;  // Hz — shortest period (6 h) → highest pitch

// ── Audio synthesis ───────────────────────────────────────────────────────────

// Synthesises one audio channel from a CWTResult.
// Returns raw (un-peak-limited) Float32Array; caller normalises across channels.
// useRealPhase=true: adds the CWT phase residual as an offset so harmonic phase
// relationships are preserved and waveform asymmetry is audible.
// useRealPhase=false: each scale runs as a free sinusoid at its mapped frequency.
function synthesize(result: CWTResult, useRealPhase: boolean): Float32Array {
  const { power, phase, background, N } = result;
  const numSamples = Math.floor(AUDIO_SAMPLE_RATE * AUDIO_DURATION);

  // Log-linear frequency map: scale 0 (MIN_PERIOD) → F_MAX, scale last (MAX_PERIOD) → F_MIN
  const freqs = new Float64Array(NUM_SCALES);
  for (let si = 0; si < NUM_SCALES; si++) {
    freqs[si] = AUDIO_F_MIN * Math.pow(AUDIO_F_MAX / AUDIO_F_MIN, (NUM_SCALES - 1 - si) / (NUM_SCALES - 1));
  }

  // Amplitude grid [scale × time]: sqrt(power / background) — relative significance
  const amps = new Float32Array(NUM_SCALES * N);
  let maxAmp = 0;
  for (let si = 0; si < NUM_SCALES; si++) {
    const bg = background[si];
    if (bg <= 0) continue;
    for (let t = 0; t < N; t++) {
      const a = Math.sqrt(Math.max(0, power[si][t]) / bg);
      amps[si * N + t] = a;
      if (a > maxAmp) maxAmp = a;
    }
  }
  const ampNorm = maxAmp > 0 ? 1 / maxAmp : 1;

  // Phase residual: CWT phase minus the linear trend expected for a pure sinusoid.
  // Isolates waveform shape (harmonic locking, asymmetry) from the carrier frequency.
  let phaseRes: Float32Array | null = null;
  if (useRealPhase) {
    phaseRes = new Float32Array(NUM_SCALES * N);
    for (let si = 0; si < NUM_SCALES; si++) {
      for (let t = 0; t < N; t++) {
        let r = phase[si][t] - (2 * Math.PI * t / SCALES[si]);
        r = ((r + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        phaseRes[si * N + t] = r;
      }
    }
  }

  // Per-scale phase accumulators — cheaper than 2π·f·n/sr per sample
  const phaseAcc = new Float64Array(NUM_SCALES);
  const phaseInc = new Float64Array(NUM_SCALES);
  for (let si = 0; si < NUM_SCALES; si++) {
    phaseInc[si] = (2 * Math.PI * freqs[si]) / AUDIO_SAMPLE_RATE;
  }

  const buf = new Float32Array(numSamples);
  for (let n = 0; n < numSamples; n++) {
    const tCwt = (n / numSamples) * (N - 1);
    const t0   = Math.floor(tCwt);
    const t1   = Math.min(t0 + 1, N - 1);
    const frac = tCwt - t0;

    let sample = 0;
    for (let si = 0; si < NUM_SCALES; si++) {
      const amp = (amps[si * N + t0] + frac * (amps[si * N + t1] - amps[si * N + t0])) * ampNorm;

      let phaseOffset = 0;
      if (phaseRes) {
        const p0 = phaseRes[si * N + t0];
        const p1 = phaseRes[si * N + t1];
        let dp = p1 - p0;
        if (dp >  Math.PI) dp -= 2 * Math.PI;
        if (dp < -Math.PI) dp += 2 * Math.PI;
        phaseOffset = p0 + frac * dp;
      }

      sample += amp * Math.cos(phaseAcc[si] + phaseOffset);
      phaseAcc[si] += phaseInc[si];
    }
    buf[n] = sample;
  }
  return buf;
}

// Combines one or two synthesized channels into a stereo AudioBuffer.
// Both channels share the same peak-normalization so stereo balance reflects relative power.
function buildAudioBuffer(
  ctx:         AudioContext,
  tempResult:  CWTResult | null,
  dpResult:    CWTResult | null,
  mode:        'temp' | 'dp' | 'stereo',
  useRealPhase: boolean,
): AudioBuffer {
  const numSamples = Math.floor(AUDIO_SAMPLE_RATE * AUDIO_DURATION);
  const L = (mode === 'temp'   || mode === 'stereo') && tempResult ? synthesize(tempResult, useRealPhase) : null;
  const R = (mode === 'dp'     || mode === 'stereo') && dpResult   ? synthesize(dpResult,   useRealPhase) : null;
  const mono = L ?? R;

  // Global peak across both channels so stereo balance is preserved
  let peak = 0;
  for (const ch of [L, R]) {
    if (!ch) continue;
    for (let i = 0; i < numSamples; i++) if (Math.abs(ch[i]) > peak) peak = Math.abs(ch[i]);
  }
  const scale = peak > 0 ? 0.85 / peak : 1;

  const audioBuf = ctx.createBuffer(2, numSamples, AUDIO_SAMPLE_RATE);
  const chL = mode === 'stereo' ? L : mono;
  const chR = mode === 'stereo' ? R : mono;
  for (const [src, idx] of [[chL, 0], [chR, 1]] as [Float32Array | null, number][]) {
    if (!src) continue;
    const out = audioBuf.getChannelData(idx);
    for (let i = 0; i < numSamples; i++) out[i] = src[i] * scale;
  }
  return audioBuf;
}

// ── FFT (radix-2 Cooley-Tukey) ────────────────────────────────────────────────

function nextPow2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uRe = 1, uIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const vRe = re[i + k + len/2] * uRe - im[i + k + len/2] * uIm;
        const vIm = re[i + k + len/2] * uIm + im[i + k + len/2] * uRe;
        re[i + k + len/2] = re[i + k] - vRe;
        im[i + k + len/2] = im[i + k] - vIm;
        re[i + k] += vRe; im[i + k] += vIm;
        const tmp = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe; uRe = tmp;
      }
    }
  }
}

function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  for (let i = 0; i < N; i++) im[i] = -im[i];
  fftInPlace(re, im);
  for (let i = 0; i < N; i++) { re[i] /= N; im[i] = -im[i] / N; }
}

// ── Morlet CWT via FFT convolution ────────────────────────────────────────────

// Morlet wavelet in frequency domain: analytic (one-sided), normalised.
function morletFreq(omega: number, s: number): number {
  if (omega <= 0) return 0;
  const x = s * omega - W0;
  return Math.pow(Math.PI, -0.25) * Math.exp(-0.5 * x * x);
}

interface CWTResult {
  power:      Float32Array[]; // [scale][time] — magnitude² / s
  phase:      Float32Array[]; // [scale][time] — atan2(im, re): 0=peak, ±π=trough, -π/2=rising, π/2=falling
  coi:        Float32Array;   // cone-of-influence period at each time step
  background: Float32Array;   // expected white-noise power per scale (for significance)
  N:          number;
}

function computeCWT(values: number[]): CWTResult {
  const N = values.length;
  const Nfft = nextPow2(N);
  const mean = values.reduce((a, b) => a + b, 0) / N;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / N;

  // AR(1) lag-1 autocorrelation estimate (T&C 1998 eq. 11): alpha = (r1 + sqrt(r2)) / 2
  // Hourly indoor data is highly autocorrelated (alpha typically 0.95–0.99).
  // This raises the background at long periods so they need stronger signal to exceed threshold,
  // and lowers it at short periods — matching the physical expectation.
  let c0 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < N;     i++) c0 += (values[i] - mean) ** 2;
  for (let i = 0; i < N - 1; i++) c1 += (values[i] - mean) * (values[i + 1] - mean);
  for (let i = 0; i < N - 2; i++) c2 += (values[i] - mean) * (values[i + 2] - mean);
  const r1 = c1 / c0, r2 = c2 / c0;
  const alpha = Math.max(0, Math.min(0.99, (r1 + Math.sqrt(Math.max(0, r2))) / 2));

  const sigRe = new Float64Array(Nfft);
  const sigIm = new Float64Array(Nfft);
  for (let i = 0; i < N; i++) sigRe[i] = values[i] - mean;
  fftInPlace(sigRe, sigIm);

  // Angular frequencies per FFT bin
  const omega = new Float64Array(Nfft);
  for (let k = 0; k < Nfft; k++) {
    omega[k] = k <= Nfft / 2
      ? (2 * Math.PI * k) / Nfft
      : (2 * Math.PI * (k - Nfft)) / Nfft;
  }

  const power: Float32Array[] = [];
  const phase: Float32Array[] = [];
  for (let si = 0; si < SCALES.length; si++) {
    const period = SCALES[si];
    // Scale in samples so that peak frequency = 2π/period rad/sample
    const s = (period * W0) / (2 * Math.PI);

    const convRe = new Float64Array(Nfft);
    const convIm = new Float64Array(Nfft);
    for (let k = 0; k < Nfft; k++) {
      const psi = morletFreq(omega[k], s) * Math.sqrt(2 * Math.PI * s);
      convRe[k] = sigRe[k] * psi;
      convIm[k] = sigIm[k] * psi;
    }
    ifftInPlace(convRe, convIm);

    const p  = new Float32Array(N);
    const ph = new Float32Array(N);
    for (let t = 0; t < N; t++) {
      p[t]  = (convRe[t] * convRe[t] + convIm[t] * convIm[t]) / s;
      ph[t] = Math.atan2(convIm[t], convRe[t]);
    }
    power.push(p);
    phase.push(ph);
  }

  // Cone of influence: e-folding time for Morlet = sqrt(2) * s
  const coiFactor = Math.SQRT2 * (2 * Math.PI) / W0;
  const coi = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    coi[t] = coiFactor * Math.min(t + 1, N - t);
  }

  // Per-scale AR(1) red noise background (T&C 1998 eq. 16).
  // Base white-noise expected power: variance * N / (Nfft * s).
  // AR(1) spectral factor at frequency f = 1/period: (1-alpha²)/(1+alpha²-2*alpha*cos(2π*f)).
  // This is >1 at low frequencies (long periods) and <1 at high frequencies (short periods),
  // so the significance threshold is higher at long periods — matching physical intuition.
  const background = new Float32Array(SCALES.length);
  for (let si = 0; si < SCALES.length; si++) {
    const s = (SCALES[si] * W0) / (2 * Math.PI);
    const f = 1 / SCALES[si]; // cycles per hour
    const ar1 = alpha < 0.01 ? 1
      : (1 - alpha * alpha) / (1 + alpha * alpha - 2 * alpha * Math.cos(2 * Math.PI * f));
    background[si] = variance * N / (Nfft * s) * ar1;
  }

  return { power, phase, coi, background, N };
}

// ── Phase / harmonic helpers ──────────────────────────────────────────────────

// Maps analytic-signal phase (atan2 convention: 0=peak, ±π=trough) to a readable label.
function phaseLabel(phi: number): string {
  const norm = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (norm < Math.PI / 4 || norm > 7 * Math.PI / 4) return 'at peak';
  if (norm < 3 * Math.PI / 4) return 'falling';
  if (norm < 5 * Math.PI / 4) return 'at trough';
  return 'rising';
}

// Returns the SCALES index whose period is closest to targetPeriod.
function nearestScaleIdx(targetPeriod: number): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < SCALES.length; i++) {
    const d = Math.abs(Math.log2(SCALES[i]) - Math.log2(targetPeriod));
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Given phase at the fundamental and its first harmonic, returns the waveform asymmetry.
// asym ≈ 0 → fast-rise / slow-fall (rising sawtooth).
// asym ≈ π → slow-rise / fast-fall (falling sawtooth).
function asymmetryLabel(phiFund: number, phiHarm: number): string {
  let asym = ((phiHarm - 2 * phiFund) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (asym > Math.PI) asym = 2 * Math.PI - asym; // fold to [0, π]
  return asym < Math.PI / 2 ? 'fast-rise / slow-fall' : 'slow-rise / fast-fall';
}

// ── Colormap (inferno-like) ───────────────────────────────────────────────────

function inferno(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [20,   11,  53]],
    [0.2, [87,   15, 109]],
    [0.4, [188,  55,  84]],
    [0.6, [237, 121,  38]],
    [0.8, [251, 193,  47]],
    [1.0, [252, 255, 164]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const u = (t - lo[0]) / (hi[0] - lo[0]);
  return [
    Math.round(lo[1][0] + u * (hi[1][0] - lo[1][0])),
    Math.round(lo[1][1] + u * (hi[1][1] - lo[1][1])),
    Math.round(lo[1][2] + u * (hi[1][2] - lo[1][2])),
  ];
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

function drawScalogram(
  canvas: HTMLCanvasElement,
  result: CWTResult,
  dark: boolean,
  tViewMin?: number,
  tViewMax?: number,
): void {
  const { power, coi, background, N } = result;
  const t0 = tViewMin ?? 0;
  const t1 = tViewMax ?? (N - 1);
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 99th-percentile normalisation to avoid outlier blowout
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(N / 2000));
  for (let si = 0; si < power.length; si++) {
    for (let t = 0; t < N; t += step) sample.push(power[si][t]);
  }
  sample.sort((a, b) => a - b);
  const maxPower = sample[Math.floor(sample.length * 0.99)] || 1;

  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;

  for (let px = 0; px < W; px++) {
    const t = t0 + Math.round((px / (W - 1)) * (t1 - t0));
    const coiPeriod = coi[t];

    for (let py = 0; py < H; py++) {
      // py=0 → top of canvas → longest period (highest scale index)
      const scaleIdx = Math.round(((H - 1 - py) / (H - 1)) * (SCALES.length - 1));
      const period = SCALES[scaleIdx];
      const p = power[scaleIdx][t];
      const idx = (py * W + px) * 4;

      if (period > coiPeriod) {
        // Inside cone of influence — flat dark grey
        const g = dark ? 35 : 210;
        d[idx] = g; d[idx+1] = g; d[idx+2] = g; d[idx+3] = 255;
      } else {
        const norm = Math.min(p / maxPower, 1);
        const [r, g, b] = inferno(norm);
        // Significance threshold is scale-dependent: background[si] * chi²₂(0.95)/2
        const thresh = background[scaleIdx] * 2.996;
        if (p >= thresh) {
          // Significant — full inferno color
          d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        } else {
          // Not significant — desaturate to luminance (greyscale)
          const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          d[idx] = lum; d[idx+1] = lum; d[idx+2] = lum; d[idx+3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // COI boundary line
  ctx.beginPath();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  for (let px = 0; px < W; px++) {
    const t = t0 + Math.round((px / (W - 1)) * (t1 - t0));
    const cp = coi[t];
    if (cp < MIN_PERIOD || cp > MAX_PERIOD) { if (px === 0) ctx.moveTo(px, H); continue; }
    const logFrac = (Math.log2(cp) - Math.log2(MIN_PERIOD)) / (Math.log2(MAX_PERIOD) - Math.log2(MIN_PERIOD));
    const py = (H - 1) - Math.round(logFrac * (H - 1));
    if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Reference period horizontal lines — shadow then white so they read on any color
  ctx.setLineDash([4, 6]);
  for (const ref of REF_PERIODS) {
    if (ref < MIN_PERIOD || ref > MAX_PERIOD) continue;
    const logFrac = (Math.log2(ref) - Math.log2(MIN_PERIOD)) / (Math.log2(MAX_PERIOD) - Math.log2(MIN_PERIOD));
    const py = Math.round((H - 1) - logFrac * (H - 1));
    // Dark shadow pass
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    // Bright pass on top
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ── Pattern extraction ────────────────────────────────────────────────────────

interface BlobInfo {
  id:             number;
  rank:           number;        // 1 = most integrated power
  size:           number;        // pixel count
  peakRatio:      number;        // max power / background
  totalPower:     number;        // sum of power/background (integrated significance)
  tMin: number;   tMax: number;
  siMin: number;  siMax: number;
  centroidT:      number;        // power-weighted mean time index
  centroidSi:     number;        // power-weighted mean scale index
  centroidPeriod: number;        // hours at power-weighted centroid (primary label)
  slope:          number;        // d(scaleIdx)/d(timeStep) — negative = chirping to shorter periods
  dateStart:  Date;
  dateEnd:    Date;
  datePeak:   Date;
  periodPeak: number;            // hours at peak pixel
  periodMin:  number;            // hours (smallest scale in blob)
  periodMax:  number;            // hours (largest scale in blob)
  durationH:  number;            // tMax - tMin
}

interface BlobExtractionResult {
  blobs:   BlobInfo[];
  blobMap: Int32Array;  // [si * N + t] → blob rank (1-based), 0 = not in blob
  N:       number;
}

// Period bands — BFS cannot cross these boundaries in the scale dimension,
// preventing the 24h band from merging with its 12h harmonics or multi-day patterns.
// Boundaries in hours: short cycles | daily | weather fronts | weekly patterns
const BAND_BREAKS = [6, 18, 42, 120, 240]; // hours
const SCALE_BAND: number[] = SCALES.map(p => {
  for (let i = 0; i < BAND_BREAKS.length - 1; i++) {
    if (p < BAND_BREAKS[i + 1]) return i;
  }
  return BAND_BREAKS.length - 2;
});

// Connected-component labeling on the significance mask.
// 4-connectivity, COI excluded, band-restricted in the scale dimension.
// Returns blobs sorted by integrated power, plus a flat rank lookup map.
function extractBlobs(result: CWTResult, dates: Date[]): BlobExtractionResult {
  const { power, coi, background, N } = result;
  const THRESHOLD = 2.996;

  const mask = new Uint8Array(NUM_SCALES * N);
  for (let si = 0; si < NUM_SCALES; si++) {
    const bg = background[si];
    if (bg <= 0) continue;
    for (let t = 0; t < N; t++) {
      if (SCALES[si] <= coi[t] && power[si][t] / bg >= THRESHOLD) mask[si * N + t] = 1;
    }
  }

  const labels = new Int32Array(NUM_SCALES * N).fill(-1);
  let nextId = 0;
  type RawBlob = Omit<BlobInfo, 'rank'>;
  const rawBlobs: RawBlob[] = [];

  for (let si0 = 0; si0 < NUM_SCALES; si0++) {
    for (let t0 = 0; t0 < N; t0++) {
      const start = si0 * N + t0;
      if (!mask[start] || labels[start] !== -1) continue;

      const queue: number[] = [start];
      let head = 0;
      labels[start] = nextId;

      while (head < queue.length) {
        const idx = queue[head++];
        const si  = Math.floor(idx / N);
        const t   = idx % N;
        const band = SCALE_BAND[si];
        // Scale neighbors: only connect within the same period band
        if (si > 0            && SCALE_BAND[si-1] === band && mask[(si-1)*N+t] && labels[(si-1)*N+t] === -1) { labels[(si-1)*N+t] = nextId; queue.push((si-1)*N+t); }
        if (si < NUM_SCALES-1 && SCALE_BAND[si+1] === band && mask[(si+1)*N+t] && labels[(si+1)*N+t] === -1) { labels[(si+1)*N+t] = nextId; queue.push((si+1)*N+t); }
        // Time neighbors: unrestricted
        if (t > 0   && mask[si*N+(t-1)] && labels[si*N+(t-1)] === -1) { labels[si*N+(t-1)] = nextId; queue.push(si*N+(t-1)); }
        if (t < N-1 && mask[si*N+(t+1)] && labels[si*N+(t+1)] === -1) { labels[si*N+(t+1)] = nextId; queue.push(si*N+(t+1)); }
      }

      if (queue.length < 4) { nextId++; continue; }

      let peakRatio = 0, peakSi = si0, peakT = t0, totalPower = 0;
      let tMin = N, tMax = -1, siMin = NUM_SCALES, siMax = -1;
      let sumW = 0, sumWt = 0, sumWsi = 0, sumWx = 0, sumWy = 0, sumWxx = 0, sumWxy = 0;

      for (let i = 0; i < queue.length; i++) {
        const idx = queue[i];
        const si  = Math.floor(idx / N);
        const t   = idx % N;
        const bg  = background[si];
        const r   = bg > 0 ? power[si][t] / bg : 0;
        totalPower += r;
        if (r > peakRatio) { peakRatio = r; peakSi = si; peakT = t; }
        if (t  < tMin)  tMin  = t;
        if (t  > tMax)  tMax  = t;
        if (si < siMin) siMin = si;
        if (si > siMax) siMax = si;
        sumW   += r; sumWt  += r * t; sumWsi += r * si;
        sumWx  += r * t; sumWy  += r * si;
        sumWxx += r * t * t; sumWxy += r * t * si;
      }

      const centroidT  = sumW > 0 ? sumWt  / sumW : (tMin + tMax) / 2;
      const centroidSi = sumW > 0 ? sumWsi / sumW : (siMin + siMax) / 2;
      // Interpolate centroid period on the log-spaced scale array
      const centroidPeriod = MIN_PERIOD * Math.pow(MAX_PERIOD / MIN_PERIOD, centroidSi / (NUM_SCALES - 1));
      const denom = sumW * sumWxx - sumWx * sumWx;
      const slope = denom !== 0 ? (sumW * sumWxy - sumWx * sumWy) / denom : 0;

      rawBlobs.push({
        id: nextId, size: queue.length, peakRatio, totalPower,
        tMin, tMax, siMin, siMax, centroidT, centroidSi, centroidPeriod, slope,
        dateStart:  dates[tMin]  ?? dates[0],
        dateEnd:    dates[Math.min(tMax,  dates.length - 1)] ?? dates[dates.length - 1],
        datePeak:   dates[Math.min(peakT, dates.length - 1)] ?? dates[0],
        periodPeak: SCALES[peakSi],
        periodMin:  SCALES[siMin],
        periodMax:  SCALES[siMax],
        durationH:  tMax - tMin,
      });
      nextId++;
    }
  }

  rawBlobs.sort((a, b) => b.totalPower - a.totalPower);
  const blobs: BlobInfo[] = rawBlobs.map((b, i) => ({ ...b, rank: i + 1 }));

  const idToRank = new Map(blobs.map(b => [b.id, b.rank]));
  const blobMap  = new Int32Array(NUM_SCALES * N);
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    if (lbl >= 0) { const r = idToRank.get(lbl); if (r !== undefined) blobMap[i] = r; }
  }

  return { blobs, blobMap, N };
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DISPLAY_TZ });
}

function describeChirp(slope: number, durationH: number): string {
  const octPerStep = Math.log2(MAX_PERIOD / MIN_PERIOD) / NUM_SCALES;
  const totalOct   = slope * durationH * octPerStep;
  if (Math.abs(totalOct) < 0.2) return '';
  const pct = Math.round((Math.pow(2, Math.abs(totalOct)) - 1) * 100);
  return totalOct < 0
    ? `Period shortened ~${pct}% over its lifetime`
    : `Period lengthened ~${pct}% over its lifetime`;
}

function bandLabel(period: number): string {
  if (period < 18)  return `Short cycle (~${formatPeriod(period)})`;
  if (period < 42)  return `Daily cycle (~${formatPeriod(period)})`;
  if (period < 120) return `Weather front (~${formatPeriod(period)})`;
  return `Weekly pattern (~${formatPeriod(period)})`;
}

function strengthLabel(peakRatio: number): string {
  if (peakRatio >= 50) return 'very strong';
  if (peakRatio >= 15) return 'strong';
  if (peakRatio >= 5)  return 'moderate';
  return 'just significant';
}

function physicalLabel(channel: 'temp' | 'dp', period: number): string {
  if (period < 18)  return channel === 'temp' ? 'Short thermal cycle'       : 'Brief moisture pulse';
  if (period < 42)  return channel === 'temp' ? 'Solar heating cycle'       : 'Daily moisture rhythm';
  if (period < 120) return channel === 'temp' ? 'Weather front passage'     : 'Storm-driven moisture';
  return                    channel === 'temp' ? 'Persistent weather system' : 'Multi-day moisture regime';
}

function spreadNote(periodMin: number, periodMax: number): string {
  const octaves = Math.log2(periodMax / periodMin);
  if (octaves < 0.3) return '';
  const rangeStr = `${formatPeriod(periodMin)}–${formatPeriod(periodMax)}`;
  if (octaves >= 0.8) return `Wide period range ${rangeStr} — irregular cycle`;
  return `Period range ${rangeStr}`;
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

function periodBandIndex(period: number): number {
  if (period < 18) return 0;   // sub-daily / harmonics
  if (period < 42) return 1;   // daily cycle
  if (period < 120) return 2;  // weather fronts
  return 3;                    // weekly patterns
}

function blobsOverlap(a: BlobInfo, b: BlobInfo): boolean {
  return a.tMin <= b.tMax && b.tMin <= a.tMax;
}

function dateHourKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}-${String(d.getUTCHours()).padStart(2,'0')}`;
}

function computeExternalStats(
  dates: Date[],
  weatherMap: Map<string, { tempF: number; dpF: number }>,
  tMin: number, tMax: number,
): ExternalStats | null {
  const temps: number[] = [], dps: number[] = [];
  for (let t = tMin; t <= tMax; t++) {
    const d = dates[t];
    if (!d) continue;
    const w = weatherMap.get(dateHourKey(d));
    if (w) { temps.push(w.tempF); dps.push(w.dpF); }
  }
  if (temps.length < 12) return null;
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd  = (a: number[]) => { const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  return { tempMean: avg(temps), tempStd: sd(temps), dpMean: avg(dps), dpStd: sd(dps), n: temps.length };
}

// ── Frequency grouping ────────────────────────────────────────────────────────

interface FrequencyGroup {
  period:       number;     // power-weighted mean centroid period (hours)
  periodMin:    number;     // min centroid period across blobs in group
  periodMax:    number;     // max centroid period across blobs in group
  blobs:        BlobInfo[]; // sorted by tMin
  totalActiveH: number;
  activePct:    number;
  totalSize:    number;
  totalPower:   number;
  maxPeak:      number;
  occurrences:  number;
  gapMeanH:     number | null;
  gapStdH:      number | null;
}

function buildFreqGroup(g: BlobInfo[], totalH: number): FrequencyGroup {
  const byTime    = [...g].sort((a, b) => a.tMin - b.tMin);
  const totP      = g.reduce((s, b) => s + b.totalPower, 0);
  const period    = totP > 0 ? g.reduce((s, b) => s + b.centroidPeriod * b.totalPower, 0) / totP : g[0].centroidPeriod;
  const totalActH = g.reduce((s, b) => s + b.durationH, 0);
  let gapMeanH: number | null = null, gapStdH: number | null = null;
  if (byTime.length > 1) {
    const gaps = byTime.slice(1).map((b, i) => Math.max(0, b.tMin - byTime[i].tMax));
    gapMeanH = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    gapStdH  = Math.sqrt(gaps.reduce((s, v) => s + (v - gapMeanH!) ** 2, 0) / gaps.length);
  }
  return {
    period,
    periodMin:    Math.min(...g.map(b => b.centroidPeriod)),
    periodMax:    Math.max(...g.map(b => b.centroidPeriod)),
    blobs:        byTime,
    totalActiveH: totalActH,
    activePct:    Math.min(100, Math.round((totalActH / Math.max(1, totalH)) * 100)),
    totalSize:    g.reduce((s, b) => s + b.size, 0),
    totalPower:   totP,
    maxPeak:      g.reduce((m, b) => Math.max(m, b.peakRatio), 0),
    occurrences:  g.length,
    gapMeanH,
    gapStdH,
  };
}

// Groups blobs whose centroid periods are within OCTAVE_THRESH octaves of the group anchor.
// A second pass merges adjacent groups whose power-weighted means are within MERGE_THRESH octaves
// (catches cases where an intermediate blob splits two near-identical-period groups apart).
function groupBlobsByPeriod(blobs: BlobInfo[], totalH: number): FrequencyGroup[] {
  if (blobs.length === 0) return [];
  const sorted = [...blobs].sort((a, b) => a.centroidPeriod - b.centroidPeriod);
  const OCTAVE_THRESH = 0.5;
  const MERGE_THRESH  = 0.3;
  const buckets: BlobInfo[][] = [];
  let cur: BlobInfo[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (Math.log2(sorted[i].centroidPeriod / cur[0].centroidPeriod) <= OCTAVE_THRESH) {
      cur.push(sorted[i]);
    } else {
      buckets.push(cur);
      cur = [sorted[i]];
    }
  }
  buckets.push(cur);

  // First pass: build groups from buckets (sorted by period ascending)
  const raw = buckets.map(g => buildFreqGroup(g, totalH))
    .sort((a, b) => a.period - b.period);

  // Second pass: merge adjacent groups whose means are within MERGE_THRESH octaves
  const merged: FrequencyGroup[] = [];
  for (const grp of raw) {
    const prev = merged[merged.length - 1];
    if (prev && Math.log2(grp.period / prev.period) <= MERGE_THRESH) {
      merged[merged.length - 1] = buildFreqGroup([...prev.blobs, ...grp.blobs], totalH);
    } else {
      merged.push(grp);
    }
  }

  return merged.sort((a, b) => b.activePct - a.activePct);
}

function gapDescription(group: FrequencyGroup): string {
  if (!group.gapMeanH || group.occurrences < 2) return '';
  const meanD = group.gapMeanH / 24;
  const cv    = group.gapStdH ? group.gapStdH / group.gapMeanH : 0;
  const regularity = cv < 0.4 ? 'regularly' : cv < 0.8 ? 'typically' : 'irregularly';
  const gapStr = meanD >= 7 ? `${(meanD / 7).toFixed(1)}w` : `${Math.round(meanD)}d`;
  return `Recurs ${regularity} every ~${gapStr} (${group.occurrences} occurrences)`;
}

// What fraction (0–100) of a group's blobs overlap temporally with any diurnal blob?
function diurnalCoincidencePct(group: FrequencyGroup, diurnalBlobs: BlobInfo[]): number {
  if (group.occurrences === 0) return 0;
  return Math.round(
    (group.blobs.filter(b => diurnalBlobs.some(d => blobsOverlap(d, b))).length / group.occurrences) * 100
  );
}

// Votes across sampled timesteps within the harmonic blob to determine dominant asymmetry direction.
function harmonicAsymmetryForBlob(result: CWTResult, harmBlob: BlobInfo): string {
  const si24 = nearestScaleIdx(24);
  const siH  = nearestScaleIdx(harmBlob.centroidPeriod);
  let fastRise = 0, slowRise = 0;
  const step = Math.max(1, Math.floor((harmBlob.tMax - harmBlob.tMin) / 20));
  for (let t = harmBlob.tMin; t <= harmBlob.tMax; t += step) {
    if (result.power[si24][t] / result.background[si24] < 2.996) continue;
    if (result.power[siH][t]  / result.background[siH]  < 2.996) continue;
    const a = asymmetryLabel(result.phase[si24][t], result.phase[siH][t]);
    if (a === 'fast-rise / slow-fall') fastRise++; else slowRise++;
  }
  if (fastRise + slowRise < 2) return '';
  return fastRise >= slowRise
    ? 'fast-rise / slow-fall — heats faster than it cools'
    : 'slow-rise / fast-fall — cools faster than it heats';
}

function externalContextLine(stats: ExternalStats | null): string {
  if (!stats) return 'KBFI data unavailable for this window';
  const range = (stats.tempStd * 2).toFixed(0);
  if (stats.tempStd >= 8) return `Large outdoor swing (±${range}°F) — weather-driven pattern`;
  if (stats.tempStd >= 4) return `Moderate outdoor variation (±${range}°F) — likely weather-coupled`;
  return `Stable outdoor conditions (±${range}°F) — may be occupancy or HVAC driven`;
}

// Reconstructs the CWT signal at scale si over [tMin, tMax] using stored power + phase.
// Real part = sqrt(power * s) * cos(phase) — gives the filtered time series at that frequency.
function CWTSparkline({ result, si, tMin, tMax, dark, width = 160, height = 28 }: {
  result: CWTResult; si: number; tMin: number; tMax: number;
  dark: boolean; width?: number; height?: number;
}) {
  const s = (SCALES[si] * W0) / (2 * Math.PI);
  const nSamples = Math.min(300, tMax - tMin + 1);
  const values: number[] = [];
  for (let i = 0; i < nSamples; i++) {
    const t = tMin + Math.round((i / Math.max(nSamples - 1, 1)) * (tMax - tMin));
    const amp = Math.sqrt(Math.max(0, result.power[si][t]) * s);
    values.push(amp * Math.cos(result.phase[si][t]));
  }
  let maxAbs = 1e-9;
  for (const v of values) if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  const mid = height / 2;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(nSamples - 1, 1)) * width;
    const y = mid - (v / maxAbs) * (mid - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const stroke = dark ? '#fbc12f' : '#b45309';
  const grid   = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <line x1={0} y1={mid} x2={width} y2={mid} stroke={grid} strokeWidth={0.5} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Chart viewport helpers ────────────────────────────────────────────────────

function applyZoom(
  [lo, hi]: [number, number],
  pivotFrac: number,     // 0–1 within the current view
  factor: number,        // > 1 = zoom out, < 1 = zoom in
): [number, number] {
  const range    = hi - lo;
  const newRange = Math.min(1, Math.max(0.01, range * factor));
  const pivot    = lo + pivotFrac * range;
  let newLo = pivot - pivotFrac * newRange;
  let newHi = pivot + (1 - pivotFrac) * newRange;
  if (newLo < 0) { newHi = Math.min(1, newHi - newLo); newLo = 0; }
  if (newHi > 1) { newLo = Math.max(0, newLo - (newHi - 1)); newHi = 1; }
  return [newLo, newHi];
}

function applyPan(
  startView: [number, number],
  startFrac: number,
  curFrac: number,
): [number, number] {
  const range = startView[1] - startView[0];
  const shift = -(curFrac - startFrac) * range;
  let newLo = Math.max(0, startView[0] + shift);
  let newHi = Math.min(1, startView[1] + shift);
  if (newHi - newLo < range) {
    if (newLo === 0) newHi = range;
    else              newLo = 1 - range;
  }
  return [newLo, newHi];
}

// ── Waveform Lanes Chart ──────────────────────────────────────────────────────

const LANES_HEIGHT_EXPANDED  = 1400;
const LANES_HEIGHT_COLLAPSED = 560;

// Single-channel waveform lanes chart. Lanes are built from the channel's own blobs.
function WaveformLanesCanvas({
  result, blobs, totalH, dark, xView, onXViewChange, ampMode, showAllLanes,
}: {
  result: CWTResult | null;
  blobs:  BlobInfo[];
  totalH: number;
  dark:   boolean;
  xView:  [number, number];
  onXViewChange: (v: [number, number]) => void;
  ampMode: 'snr' | 'power' | 'gated';
  showAllLanes: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartH = showAllLanes ? LANES_HEIGHT_EXPANDED : LANES_HEIGHT_COLLAPSED;

  const lanes = useMemo(() => computeLanesFromBlobs(blobs, totalH), [blobs, totalH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const N = result.power[0].length;
    const t0 = Math.round(xView[0] * (N - 1));
    const t1 = Math.round(xView[1] * (N - 1));

    const logRange  = Math.log2(MAX_PERIOD / MIN_PERIOD);
    const LANE_PAD  = 52;
    const periodToY = (p: number) => {
      const logFrac = (Math.log2(Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, p))) - Math.log2(MIN_PERIOD)) / logRange;
      return LANE_PAD + (H - 1 - 2 * LANE_PAD) * (1 - logFrac);
    };

    ctx.fillStyle = dark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = dark ? 'rgba(0,0,0,0.30)' : 'rgba(180,180,180,0.22)';
    for (let px = 0; px < W; px++) {
      const t      = t0 + Math.round((px / (W - 1)) * (t1 - t0));
      const cp     = result.coi[t];
      const lf     = (Math.log2(cp) - Math.log2(MIN_PERIOD)) / logRange;
      const coiY   = Math.round(LANE_PAD + (H - 1 - 2 * LANE_PAD) * (1 - lf));
      if (coiY > 0) ctx.fillRect(px, 0, 1, Math.min(H, coiY));
    }

    const amberColor = dark ? '#fbc12f' : '#b45309';
    const grayColor  = dark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.40)';

    // Build the list of bins to draw and their y-positions + amplitude budgets
    interface DrawLane { si: number; period: number; yc: number; amp: number; isSignificant: boolean; }
    const drawLanes: DrawLane[] = [];

    if (showAllLanes) {
      // All 50 bins: uniform spacing since they're log-spaced on a log y-axis
      const spacingPx = (H - 1 - 2 * LANE_PAD) / (NUM_SCALES - 1);
      const amp       = spacingPx * 0.38;
      const significantSis = new Set(lanes.map(l => l.si));
      for (let si = 0; si < NUM_SCALES; si++) {
        drawLanes.push({ si, period: SCALES[si], yc: periodToY(SCALES[si]), amp, isSignificant: significantSis.has(si) });
      }
    } else {
      // Significant lanes only: amplitude from half-distance to nearest neighbor
      const ys = lanes.map(l => periodToY(l.period));
      lanes.forEach(({ si, period }, i) => {
        const yc    = ys[i];
        const dUp   = i > 0             ? Math.abs(yc - ys[i - 1]) : H;
        const dDown = i < lanes.length - 1 ? Math.abs(ys[i + 1] - yc) : H;
        const amp   = Math.min(Math.min(dUp, dDown) * 0.40, 44);
        drawLanes.push({ si, period, yc, amp, isSignificant: true });
      });
    }

    for (const { si, period, yc, amp, isSignificant } of drawLanes) {
      const thresh = result.background[si] * 2.996;

      let maxA = 1e-12;
      if (ampMode === 'power' || ampMode === 'gated') {
        for (let t = 0; t < N; t++) {
          const sq = Math.sqrt(Math.max(0, result.power[si][t]));
          if (sq > maxA) maxA = sq;
        }
      }

      ctx.strokeStyle = isSignificant ? amberColor : grayColor;
      ctx.lineWidth   = isSignificant ? 1.5 : 0.75;
      ctx.beginPath();
      for (let px = 0; px < W; px++) {
        const t     = t0 + Math.round((px / (W - 1)) * (t1 - t0));
        const inCOI = period > result.coi[t];
        let normY = 0;
        if (!inCOI) {
          const p    = result.power[si][t];
          const gate = Math.min(1, Math.max(0, (p / thresh - 1) * 2));
          const a    = ampMode === 'snr'   ? gate
                     : ampMode === 'power' ? Math.sqrt(Math.max(0, p)) / maxA
                     : /* gated */           gate * Math.sqrt(Math.max(0, p)) / maxA;
          normY = a * Math.cos(result.phase[si][t]);
        }
        const py = yc - normY * amp;
        if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }, [lanes, result, dark, xView, ampMode, showAllLanes]);

  const waveformDragRef = useRef<{ startFrac: number; startView: [number, number] } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      onXViewChange(applyZoom(xView, frac, factor));
    };
    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      waveformDragRef.current = { startFrac: (e.clientX - rect.left) / rect.width, startView: xView };
      canvas.style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!waveformDragRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const cur = (e.clientX - rect.left) / rect.width;
      onXViewChange(applyPan(waveformDragRef.current.startView, waveformDragRef.current.startFrac, cur));
    };
    const onMouseUp = () => { waveformDragRef.current = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.style.cursor = 'grab';
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
    };
  }, [xView, onXViewChange]);

  if (!result) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row' }}>
      <Box sx={{ width: 44, flexShrink: 0, position: 'relative', height: chartH }}>
        {showAllLanes ? (
          // Expanded: label every bin; amber + bold for significant, gray for others
          SCALES.map((scalePeriod, si) => {
            const LANE_PAD  = 52;
            const logFrac   = (Math.log2(scalePeriod) - Math.log2(MIN_PERIOD)) / Math.log2(MAX_PERIOD / MIN_PERIOD);
            const top       = LANE_PAD + (chartH - 1 - 2 * LANE_PAD) * (1 - logFrac);
            const sigLane   = lanes.find(l => l.si === si);
            const label     = sigLane?.label ?? `~${formatPeriod(scalePeriod)}`;
            return (
              <Typography key={si} variant="caption" sx={{
                position: 'absolute', right: 4, top,
                transform: 'translateY(-50%)', fontSize: '9px', whiteSpace: 'nowrap',
                color: sigLane ? (dark ? '#fbc12f' : '#b45309') : 'text.secondary',
                fontWeight: sigLane ? 600 : 400,
              }}>
                {label}
              </Typography>
            );
          })
        ) : (
          // Collapsed: significant lanes only
          lanes.map(({ period, label }) => {
            const LANE_PAD = 52;
            const logFrac  = (Math.log2(period) - Math.log2(MIN_PERIOD)) / Math.log2(MAX_PERIOD / MIN_PERIOD);
            const top      = LANE_PAD + (chartH - 1 - 2 * LANE_PAD) * (1 - logFrac);
            return (
              <Typography key={period} variant="caption" color="text.secondary" sx={{
                position: 'absolute', right: 4, top,
                transform: 'translateY(-50%)', fontSize: '9px', whiteSpace: 'nowrap',
              }}>
                {label}
              </Typography>
            );
          })
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <canvas
          ref={canvasRef}
          width={1200}
          height={chartH}
          style={{ width: '100%', height: chartH, display: 'block', imageRendering: 'pixelated', cursor: 'grab' }}
        />
      </Box>
    </Box>
  );
}

// ── Shared lane helper ────────────────────────────────────────────────────────

function computeLanesFromBlobs(
  blobs: BlobInfo[], totalH: number,
): Array<{ si: number; label: string; period: number }> {
  const diurnal  = blobs.filter(b => periodBandIndex(b.centroidPeriod) === 1);
  const subDaily = blobs.filter(b => periodBandIndex(b.centroidPeriod) === 0);
  const weather  = blobs.filter(b => periodBandIndex(b.centroidPeriod) >= 2);
  const used = new Map<number, string>();
  const add = (si: number, label: string) => { if (!used.has(si)) used.set(si, label); };
  for (const g of groupBlobsByPeriod(weather, totalH))  { const si = nearestScaleIdx(g.period); add(si, `~${formatPeriod(SCALES[si])}`); }
  if (diurnal.length > 0) add(nearestScaleIdx(24), '~24h');
  for (const g of groupBlobsByPeriod(subDaily, totalH)) { const si = nearestScaleIdx(g.period); add(si, `~${formatPeriod(SCALES[si])}`); }
  return [...used.entries()]
    .map(([si, label]) => ({ si, label, period: SCALES[si] }))
    .sort((a, b) => b.period - a.period);
}

// ── Band PLV Matrix ───────────────────────────────────────────────────────────

// Find simplest n/m ≈ ratio (ratio >= 1) with n,m <= maxInt.
// Prefers smaller n+m when error is similar (simpler polyrhythm).
function rationalApprox(ratio: number, maxInt = 8): [number, number] {
  let bestN = 1, bestM = 1, bestScore = Infinity;
  for (let m = 1; m <= maxInt; m++) {
    const n = Math.round(ratio * m);
    if (n < 1 || n > maxInt * 3) continue;
    const err = Math.abs(n / m - ratio) / ratio; // relative error
    const score = err + (n + m) * 0.015;          // slight complexity penalty
    if (score < bestScore) { bestScore = score; bestN = n; bestM = m; }
  }
  return [bestN, bestM];
}

// Power-weighted PLV for n:m phase locking between two CWT bands.
// Each sample is weighted by sqrt(power_A * power_B) so noise-floor moments
// (where phase is meaningless) contribute almost nothing to the average.
// Only samples outside the COI for both bands are included.
function computePLV(
  result: CWTResult,
  siA: number, siB: number,
  periodA: number, periodB: number,
  n: number, m: number,
): number {
  const phaseA = result.phase[siA] as unknown as ArrayLike<number>;
  const phaseB = result.phase[siB] as unknown as ArrayLike<number>;
  const N = phaseA.length;
  let sumCos = 0, sumSin = 0, sumW = 0;
  for (let t = 0; t < N; t++) {
    if (periodA > result.coi[t] || periodB > result.coi[t]) continue;
    const w = Math.sqrt(Math.max(0, result.power[siA][t]) * Math.max(0, result.power[siB][t]));
    if (w < 1e-30) continue;
    const dPhi = n * phaseA[t] - m * phaseB[t];
    sumCos += w * Math.cos(dPhi);
    sumSin += w * Math.sin(dPhi);
    sumW   += w;
  }
  if (sumW < 1e-30) return 0;
  return Math.sqrt(sumCos ** 2 + sumSin ** 2) / sumW;
}

function BandPLVMatrix({
  result, blobs, totalH, dark,
}: {
  result: CWTResult;
  blobs:  BlobInfo[];
  totalH: number;
  dark:   boolean;
}) {
  const lanes = useMemo(() => computeLanesFromBlobs(blobs, totalH), [blobs, totalH]);

  // cells[i][j] = { plv, ratioStr } for i != j; null on diagonal
  const matrix = useMemo(() => {
    const L = lanes.length;
    if (L < 2) return null;
    type Cell = { plv: number; ratio: string };
    const cells: (Cell | null)[][] = Array.from({ length: L }, () => Array(L).fill(null));
    for (let i = 0; i < L; i++) {
      for (let j = i + 1; j < L; j++) {
        // lanes sorted descending by period, so lanes[i].period > lanes[j].period
        const lA = lanes[i], lB = lanes[j];
        const [n, m] = rationalApprox(lA.period / lB.period);
        const plv = computePLV(result, lA.si, lB.si, lA.period, lB.period, n, m);
        cells[i][j] = { plv, ratio: `${n}:${m}` };
        cells[j][i] = { plv, ratio: `${m}:${n}` }; // mirror — same PLV, inverted notation
      }
    }
    return cells;
  }, [result, lanes]);

  if (!matrix || lanes.length < 2) return null;

  const CELL = 64, LABEL_W = 50;

  const cellBg = (plv: number): string => {
    // non-linear so even modest PLV (0.3) gets visible colour
    const a = Math.pow(plv, 0.55);
    return dark ? `rgba(251,193,47,${a * 0.80})` : `rgba(180,83,9,${a * 0.70})`;
  };

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'inline-block' }}>
        {/* Column headers */}
        <Box sx={{ display: 'flex', ml: `${LABEL_W}px`, mb: 0.25 }}>
          {lanes.map(l => (
            <Box key={l.si} 
            sx={{ width: CELL, textAlign: 'center' }}>
              <Typography variant="caption" 
              sx={{ fontSize: '9px', color: 'text.secondary' }}>{l.label}</Typography>
            </Box>
          ))}
        </Box>
        {/* Matrix rows */}
        {lanes.map((rowLane, i) => (
          <Box key={rowLane.si} 
          sx={{ display: 'flex', alignItems: 'center', mb: '1px' }}>
            <Box sx={{ width: LABEL_W, textAlign: 'right', pr: 0.75, flexShrink: 0 }}>
              <Typography variant="caption" 
              sx={{ fontSize: '9px', color: 'text.secondary' }}>{rowLane.label}</Typography>
            </Box>
            {lanes.map((colLane, j) => {
              const isDiag = i === j;
              const cell   = matrix[i][j];
              const plv    = cell?.plv ?? 0;
              const bright = plv > 0.5;
              return (
                <Box key={colLane.si} 
                sx={{
                  width: CELL, height: CELL,
                  bgcolor: isDiag
                    ? (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                    : cellBg(plv),
                  border: '1px solid',
                  borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isDiag ? (
                    <Typography sx={{ fontSize: '11px', color: 'text.disabled' }}>—</Typography>
                  ) : (
                    <>
                      <Typography sx={{
                        fontSize: '11px', fontWeight: 600, lineHeight: 1.3,
                        color: bright ? '#fff' : 'text.primary',
                      }}>
                        {plv.toFixed(2)}
                      </Typography>
                      <Typography sx={{
                        fontSize: '8px', lineHeight: 1.1,
                        color: bright ? 'rgba(255,255,255,0.78)' : 'text.secondary',
                      }}>
                        {cell?.ratio}
                      </Typography>
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPeriod(hours: number): string {
  if (hours >= 168) return `${(hours / 168).toFixed(1)}w`;
  if (hours >= 24)  return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(0)}h`;
}

async function fetchWeatherHourly(): Promise<WeatherRow[]> {
  const p = new URLSearchParams({
    provider: 'noaa', station: 'KBFI',
    start_ts: '2025-11-01T00:00:00',
    tz: 'America/Los_Angeles',
    page_limit: '500', max_pages: '20',
  });
  try {
    const res = await fetch(`${API_BASE}/weather/hourly?${p}`, { headers: { 'X-Status-Token': API_TOKEN } });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.rows ?? []) as WeatherRow[];
  } catch { return []; }
}

async function fetchAggregates(): Promise<Aggregate[]> {
  const p = new URLSearchParams({
    bucket: '3600', aggregate_mode: 'full', limit: '10000',
    order_desc: 'false', start_ts: '2025-11-01T00:00:00',
  });
  const res = await fetch(`${API_BASE}/timeseries?${p}`, { headers: { 'X-Status-Token': API_TOKEN } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  return (json.aggregates ?? []) as Aggregate[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

const WaveletPage: NextPage = () => {
  usePageView();
  const settings = useSettings();
  const dark = settings.paletteMode === 'dark';

  const [aggregates, setAggregates] = useState<Aggregate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [weatherRows, setWeatherRows] = useState<WeatherRow[]>([]);
  const computing                   = useRef(false);

  const tempCanvasRef  = useRef<HTMLCanvasElement>(null);
  const dpCanvasRef    = useRef<HTMLCanvasElement>(null);
  const tempResultRef  = useRef<CWTResult | null>(null);
  const dpResultRef    = useRef<CWTResult | null>(null);

  const tempExtractionRef = useRef<BlobExtractionResult | null>(null);
  const dpExtractionRef   = useRef<BlobExtractionResult | null>(null);
  const [tempBlobs, setTempBlobs] = useState<BlobInfo[]>([]);
  const [dpBlobs,   setDpBlobs]   = useState<BlobInfo[]>([]);

  const [cwtReady, setCwtReady]                           = useState(false);
  const [xView, setXView]                                 = useState<[number, number]>([0, 1]);
  const [ampMode, setAmpMode]                             = useState<'snr' | 'power' | 'gated'>('gated');
  const [showAllLanes, setShowAllLanes]                   = useState(false);
  const scalogramDragRef = useRef<{ startFrac: number; startView: [number, number] } | null>(null);
  const [audioPlaying, setAudioPlaying]                   = useState<'temp' | 'dp' | 'stereo' | null>(null);
  const [audioLoading, setAudioLoading]                   = useState(false);
  const [realPhase, setRealPhase]                         = useState(true);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  interface TooltipState {
    x: number; y: number;          // CSS px relative to canvas box
    canvasId: 'temp' | 'dp';
    dateLabel: string;
    periodLabel: string;
    ratio: number;                 // power / background (× threshold)
    phase: number;                 // atan2(im, re) in radians
    harmonicRatio: number;         // power/background at the first harmonic (half-period); 0 if out of range
    harmonicAsymmetry: string;     // 'fast-rise / slow-fall' | 'slow-rise / fast-fall' | ''
    blobRank:   number;             // 0 = not in a blob
    blobPeriod: string;             // formatted centroid period
    blobSpan:   string;             // "Feb 15 – Mar 3 (16d)"
    blobChirp:  string;             // '' if stable, else plain-English period drift description
    inCOI: boolean;
  }
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    fetchAggregates()
      .then(setAggregates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWeatherHourly().then(setWeatherRows);
  }, []);

  const weatherMap = useMemo(() => {
    const map = new Map<string, { tempF: number; dpF: number }>();
    for (const row of weatherRows) {
      if (row.temp_c_avg === null) continue;
      const tempF = row.temp_c_avg * 9 / 5 + 32;
      const dpF = row.dewpoint_c_avg !== null
        ? row.dewpoint_c_avg * 9 / 5 + 32
        : (row.rh_avg !== null ? rhToDewPoint(tempF, row.rh_avg) : tempF - 10);
      map.set(dateHourKey(new Date(row.bucket_start)), { tempF, dpF });
    }
    return map;
  }, [weatherRows]);

  // Gap-fill: linear for gaps ≤ 6h, mean-fill for longer; then convert RH → dew point
  const filled = useMemo(() => {
    if (aggregates.length === 0) return { temp: [] as number[], dp: [] as number[], dates: [] as Date[] };
    const validTemp = aggregates.filter(a => a.temp_f_avg !== null);
    const validRh   = aggregates.filter(a => a.rh_avg !== null);
    const tempMean = validTemp.reduce((s, a) => s + (a.temp_f_avg ?? 0), 0) / Math.max(1, validTemp.length);
    const rhMean   = validRh.reduce((s, a)   => s + (a.rh_avg   ?? 0), 0) / Math.max(1, validRh.length);

    const temp: number[] = [], rh: number[] = [], dates: Date[] = [];
    for (let i = 0; i < aggregates.length; i++) {
      const curr = aggregates[i];
      if (i > 0) {
        const prev = aggregates[i - 1];
        const gapH = (new Date(curr.bucket_start).getTime() - new Date(prev.bucket_start).getTime()) / 3_600_000;
        const steps = Math.round(gapH) - 1;
        for (let s = 1; s <= steps; s++) {
          const frac = s / gapH;
          dates.push(new Date(new Date(prev.bucket_start).getTime() + s * 3_600_000));
          if (gapH <= 6) {
            temp.push((prev.temp_f_avg ?? tempMean) + frac * ((curr.temp_f_avg ?? tempMean) - (prev.temp_f_avg ?? tempMean)));
            rh.push((prev.rh_avg ?? rhMean) + frac * ((curr.rh_avg ?? rhMean) - (prev.rh_avg ?? rhMean)));
          } else {
            temp.push(tempMean);
            rh.push(rhMean);
          }
        }
      }
      temp.push(curr.temp_f_avg ?? tempMean);
      rh.push(curr.rh_avg ?? rhMean);
      dates.push(new Date(curr.bucket_start));
    }
    const dp = temp.map((t, i) => rhToDewPoint(t, rh[i]));
    return { temp, dp, dates };
  }, [aggregates]);

  // CWT + draw — runs when data is ready or dark mode changes
  useEffect(() => {
    if (filled.temp.length === 0) return;
    if (!tempCanvasRef.current || !dpCanvasRef.current) return;
    if (computing.current) return;
    computing.current = true;

    const tempCanvas = tempCanvasRef.current;
    const dpCanvas   = dpCanvasRef.current;

    // Yield to the browser paint before the heavy compute
    requestAnimationFrame(() => {
      const tempResult = computeCWT(filled.temp);
      const dpResult   = computeCWT(filled.dp);

      tempResultRef.current = tempResult;
      dpResultRef.current   = dpResult;

      const tMinDraw = Math.round(xView[0] * (tempResult.N - 1));
      const tMaxDraw = Math.round(xView[1] * (tempResult.N - 1));
      drawScalogram(tempCanvas, tempResult, dark, tMinDraw, tMaxDraw);
      drawScalogram(dpCanvas,   dpResult,   dark, tMinDraw, tMaxDraw);

      const tExtract = extractBlobs(tempResult, filled.dates);
      const dExtract = extractBlobs(dpResult,   filled.dates);
      tempExtractionRef.current = tExtract;
      dpExtractionRef.current   = dExtract;
      setTempBlobs(tExtract.blobs);
      setDpBlobs(dExtract.blobs);

      computing.current = false;
      setCwtReady(true);
    });
  }, [filled, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw scalograms when xView changes (without recomputing CWT)
  useEffect(() => {
    const tR = tempResultRef.current;
    const dR = dpResultRef.current;
    if (!tR || !dR || !cwtReady) return;
    const tMin = Math.round(xView[0] * (tR.N - 1));
    const tMax = Math.round(xView[1] * (tR.N - 1));
    if (tempCanvasRef.current) drawScalogram(tempCanvasRef.current, tR, dark, tMin, tMax);
    if (dpCanvasRef.current)   drawScalogram(dpCanvasRef.current,   dR, dark, tMin, tMax);
  }, [xView, dark, cwtReady]);

  // Wheel zoom + drag pan on scalogram canvases
  const handleXViewChange = useCallback((v: [number, number]) => setXView(v), []);

  const handleExportJSON = useCallback(() => {
    const N = filled.dates.length;
    if (N === 0) return;

    const STRIDE = 4; // envelope/phase downsampled to every 4h
    const SIG_THRESH = 2.996;

    const buildSignal = (result: CWTResult | null, blobs: BlobInfo[]) => {
      if (!result) return null;
      const lanes = computeLanesFromBlobs(blobs, N);

      // PLV matrix
      const plvLabels = lanes.map(l => l.label);
      const plvValues: (number | null)[][] = [];
      const plvRatios: (string | null)[][] = [];
      for (let i = 0; i < lanes.length; i++) {
        const rowV: (number | null)[] = [];
        const rowR: (string | null)[] = [];
        for (let j = 0; j < lanes.length; j++) {
          if (i === j) { rowV.push(null); rowR.push(null); continue; }
          const [lA, lB] = lanes[i].period >= lanes[j].period
            ? [lanes[i], lanes[j]] : [lanes[j], lanes[i]];
          const [n, m] = rationalApprox(lA.period / lB.period);
          const plv = computePLV(result, lA.si, lB.si, lA.period, lB.period, n, m);
          const ratio = lanes[i].period >= lanes[j].period ? `${n}:${m}` : `${m}:${n}`;
          rowV.push(+plv.toFixed(3));
          rowR.push(ratio);
        }
        plvValues.push(rowV);
        plvRatios.push(rowR);
      }

      // Per-band data
      const bands = lanes.map(({ si, label, period }) => {
        const thresh = result.background[si] * SIG_THRESH;

        // Gate: 1 where significant and outside COI
        const gate: number[] = new Array(N).fill(0);
        let validSamples = 0;
        for (let t = 0; t < N; t++) {
          const outsideCOI = period <= result.coi[t];
          if (outsideCOI) {
            validSamples++;
            if (result.power[si][t] >= thresh) gate[t] = 1;
          }
        }
        const activeCount = gate.reduce((s, v) => s + v, 0);

        // Normalised amplitude envelope (downsampled)
        let maxA = 1e-12;
        for (let t = 0; t < N; t++) maxA = Math.max(maxA, Math.sqrt(Math.max(0, result.power[si][t])));
        const amplitudeEnvelope: number[] = [];
        for (let t = 0; t < N; t += STRIDE)
          amplitudeEnvelope.push(+(Math.sqrt(Math.max(0, result.power[si][t])) / maxA).toFixed(4));

        // Phase in radians (downsampled)
        const ph = result.phase[si] as unknown as ArrayLike<number>;
        const phase: number[] = [];
        for (let t = 0; t < N; t += STRIDE) phase.push(+ph[t].toFixed(4));

        // Blobs belonging to this lane
        const laneSi = si;
        const laneBlobs = blobs
          .filter(b => nearestScaleIdx(b.centroidPeriod) === laneSi)
          .map(b => ({
            start_hour:            b.tMin,
            end_hour:              b.tMax,
            duration_hours:        b.durationH,
            centroid_period_hours: +b.centroidPeriod.toFixed(2),
            peak_snr:              +b.peakRatio.toFixed(3),
            date_start:            b.dateStart.toISOString(),
            date_end:              b.dateEnd.toISOString(),
          }));

        return {
          label,
          period_hours:         +period.toFixed(2),
          scale_index:          si,
          period_ratio_to_24h:  +(period / 24).toFixed(4),
          euclidean:            { k: activeCount, n: validSamples },
          blobs:                laneBlobs,
          gate,
          amplitude_envelope:   amplitudeEnvelope,
          phase,
          envelope_sample_interval_hours: STRIDE,
        };
      });

      return {
        bands,
        plv_matrix: { labels: plvLabels, values: plvValues, ratios: plvRatios },
      };
    };

    const output = {
      meta: {
        exported_at:            new Date().toISOString(),
        start_date:             filled.dates[0].toISOString(),
        end_date:               filled.dates[N - 1].toISOString(),
        total_hours:            N,
        sample_interval_hours:  1,
        envelope_stride_hours:  STRIDE,
      },
      signals: {
        temperature_f: buildSignal(tempResultRef.current, tempBlobs),
        dewpoint_f:    buildSignal(dpResultRef.current,   dpBlobs),
      },
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const d0   = filled.dates[0].toISOString().slice(0, 10);
    const d1   = filled.dates[N - 1].toISOString().slice(0, 10);
    a.download = `wavelet_${d0}_${d1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filled, tempBlobs, dpBlobs]);

  useEffect(() => {
    const canvases = [tempCanvasRef.current, dpCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = e.currentTarget as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      setXView(v => applyZoom(v, frac, e.deltaY > 0 ? 1.25 : 0.8));
    };
    const onMouseDown = (e: MouseEvent) => {
      const canvas = e.currentTarget as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      scalogramDragRef.current = { startFrac: (e.clientX - rect.left) / rect.width, startView: xView };
      canvas.style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MouseEvent) => {
      const drag = scalogramDragRef.current;
      if (!drag) return;
      const canvas = e.currentTarget as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const cur = (e.clientX - rect.left) / rect.width;
      setXView(applyPan(drag.startView, drag.startFrac, cur));
    };
    const onMouseUp = (e: MouseEvent) => {
      scalogramDragRef.current = null;
      (e.currentTarget as HTMLCanvasElement).style.cursor = 'crosshair';
    };
    canvases.forEach(c => {
      c.addEventListener('wheel', onWheel, { passive: false });
      c.addEventListener('mousedown', onMouseDown);
      c.addEventListener('mousemove', onMouseMove);
      c.addEventListener('mouseup', onMouseUp);
      c.addEventListener('mouseleave', onMouseUp);
    });
    return () => canvases.forEach(c => {
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('mousedown', onMouseDown);
      c.removeEventListener('mousemove', onMouseMove);
      c.removeEventListener('mouseup', onMouseUp);
      c.removeEventListener('mouseleave', onMouseUp);
    });
  }, [cwtReady, xView]); // eslint-disable-line react-hooks/exhaustive-deps

  // X-axis date ticks — month boundaries in DISPLAY_TZ, labeled with month + day
  const xTicks = useMemo(() => {
    if (filled.dates.length === 0) return [];
    const first  = filled.dates[0];
    const last   = filled.dates[filled.dates.length - 1];
    const spanMs = last.getTime() - first.getTime();
    const ticks: { label: string; pct: number }[] = [];

    // Determine the year/month of the first data point in DISPLAY_TZ, then advance to next month
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, year: 'numeric', month: 'numeric' })
        .formatToParts(first)
        .map(p => [p.type, p.value])
    );
    let year  = parseInt(parts.year);
    let month = parseInt(parts.month) - 1; // 0-indexed
    month++;
    if (month > 11) { month = 0; year++; }

    let d = tzMonthStart(year, month);
    while (d <= last) {
      ticks.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DISPLAY_TZ }),
        pct: (d.getTime() - first.getTime()) / spanMs,
      });
      month++;
      if (month > 11) { month = 0; year++; }
      d = tzMonthStart(year, month);
    }
    return ticks;
  }, [filled.dates]);

  // Audio play / stop — computation runs after a frame delay so loading state paints first
  const stopAudio = () => {
    try { audioSourceRef.current?.stop(); } catch { /* already stopped */ }
    audioCtxRef.current?.close();
    audioSourceRef.current = null;
    audioCtxRef.current    = null;
    setAudioPlaying(null);
  };

  const playAudio = (mode: 'temp' | 'dp' | 'stereo') => {
    if (audioPlaying) { stopAudio(); return; }
    if (!tempResultRef.current || !dpResultRef.current) return;
    setAudioLoading(true);
    const tRef = tempResultRef.current;
    const dRef = dpResultRef.current;
    const rp   = realPhase;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx    = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      const buffer = buildAudioBuffer(ctx, tRef, dRef, mode, rp);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        ctx.close();
        audioCtxRef.current    = null;
        audioSourceRef.current = null;
        setAudioPlaying(null);
      };
      source.start();
      audioCtxRef.current    = ctx;
      audioSourceRef.current = source;
      setAudioLoading(false);
      setAudioPlaying(mode);
    }));
  };

  // Cleanup on unmount
  useEffect(() => () => { stopAudio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const makeMouseHandler = (resultRef: React.RefObject<CWTResult | null>, canvasId: 'temp' | 'dp') =>
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const result = resultRef.current;
      if (!result) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pxCss = e.clientX - rect.left;
      const pyCss = e.clientY - rect.top;
      if (scalogramDragRef.current) return; // suppress tooltip during drag
      const px = (pxCss / rect.width)  * 1200;
      const py = (pyCss / rect.height) * CANVAS_HEIGHT;
      const tMin = Math.round(xView[0] * (result.N - 1));
      const tMax = Math.round(xView[1] * (result.N - 1));
      const t    = tMin + Math.round((px / 1199) * (tMax - tMin));
      const scaleIdx = Math.round(((CANVAS_HEIGHT - 1 - py) / (CANVAS_HEIGHT - 1)) * (NUM_SCALES - 1));
      if (t < 0 || t >= result.N || scaleIdx < 0 || scaleIdx >= NUM_SCALES) { setTooltip(null); return; }

      const period    = SCALES[scaleIdx];
      const power     = result.power[scaleIdx][t];
      const bg        = result.background[scaleIdx];
      const coiPeriod = result.coi[t];
      const ratio     = bg > 0 ? power / bg : 0;
      const inCOI     = period > coiPeriod;
      const date      = filled.dates[t];
      const phi       = result.phase[scaleIdx][t];

      // First harmonic: half the current period
      const harmIdx       = nearestScaleIdx(period / 2);
      const harmPeriod    = SCALES[harmIdx];
      const harmInRange   = harmPeriod >= MIN_PERIOD && Math.abs(Math.log2(harmPeriod) - Math.log2(period / 2)) < 0.3;
      const harmBg        = result.background[harmIdx];
      const harmPower     = result.power[harmIdx][t];
      const harmonicRatio = harmInRange && harmBg > 0 ? harmPower / harmBg : 0;
      const harmonicAsymmetry = harmInRange && harmonicRatio >= 2.996 && ratio >= 2.996
        ? asymmetryLabel(phi, result.phase[harmIdx][t])
        : '';

      const dateLabel = date
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: DISPLAY_TZ }) +
          ', ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ, timeZoneName: 'short' })
        : '';

      // Blob context from extraction map
      const extraction = canvasId === 'temp' ? tempExtractionRef.current : dpExtractionRef.current;
      let blobRank = 0, blobPeriod = '', blobSpan = '', blobChirp = '';
      if (extraction) {
        const rank = extraction.blobMap[scaleIdx * extraction.N + t];
        if (rank > 0) {
          const blob  = extraction.blobs[rank - 1];
          blobRank    = rank;
          blobPeriod  = formatPeriod(blob.centroidPeriod);
          const durD  = blob.durationH / 24;
          const durStr = durD >= 14 ? `${(durD / 7).toFixed(1)}w` : `${Math.round(durD)}d`;
          blobSpan    = `${formatDateShort(blob.dateStart)} – ${formatDateShort(blob.dateEnd)} (${durStr})`;
          blobChirp   = describeChirp(blob.slope, blob.durationH);
        }
      }

      setTooltip({ x: pxCss, y: pyCss, canvasId, dateLabel, periodLabel: formatPeriod(period),
        ratio, phase: phi, harmonicRatio, harmonicAsymmetry, blobRank, blobPeriod, blobSpan, blobChirp, inCOI });
    };

  const canvasJSX = (
    ref:       React.RefObject<HTMLCanvasElement>,
    resultRef: React.RefObject<CWTResult | null>,
    canvasId:  'temp' | 'dp',
  ) => (
    <Box sx={{ display: 'flex', flexDirection: 'row' }}>
      {/* Y-axis */}
      <Box sx={{ width: 44, flexShrink: 0, position: 'relative', height: CANVAS_HEIGHT }}>
        {Y_TICKS.map(p => {
          const logFrac = (Math.log2(p) - Math.log2(MIN_PERIOD)) / (Math.log2(MAX_PERIOD) - Math.log2(MIN_PERIOD));
          const top = (1 - logFrac) * CANVAS_HEIGHT;
          return (
            <Typography key={p} variant="caption" color="text.secondary" sx={{
              position: 'absolute', right: 4, top, transform: 'translateY(-50%)',
              fontSize: '10px', whiteSpace: 'nowrap',
            }}>
              {formatPeriod(p)}
            </Typography>
          );
        })}
      </Box>
      {/* Canvas + toolbar + tooltip overlay */}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {chartToolbar}
        <canvas
          ref={ref}
          width={1200}
          height={CANVAS_HEIGHT}
          onMouseMove={makeMouseHandler(resultRef, canvasId)}
          onMouseLeave={() => { setTooltip(null); }}
          style={{ width: '100%', height: CANVAS_HEIGHT, display: 'block', imageRendering: 'pixelated', cursor: 'crosshair' }}
        />
        {tooltip?.canvasId === canvasId && (
          <Box sx={{
            position: 'absolute',
            left: tooltip.x + 14,
            top:  tooltip.y - 12,
            pointerEvents: 'none',
            bgcolor: dark ? 'rgba(20,20,30,0.92)' : 'rgba(255,255,255,0.92)',
            border: '1px solid',
            borderColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
            borderRadius: 1,
            px: 1.25, py: 0.75,
            zIndex: 10,
            backdropFilter: 'blur(4px)',
          }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '11px' }}>
              {tooltip.dateLabel}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', fontSize: '11px' }}>
              Period: {tooltip.periodLabel}
            </Typography>
            <Typography variant="caption" sx={{
              display: 'block', fontSize: '11px',
              color: tooltip.inCOI ? 'text.secondary'
                : tooltip.ratio >= 2.996 ? (dark ? '#fbc12f' : '#b45309')
                : 'text.secondary',
            }}>
              {tooltip.inCOI
                ? 'Inside cone of influence'
                : `${tooltip.ratio.toFixed(2)}× background${tooltip.ratio >= 2.996 ? ' ✓ significant' : ''}`}
            </Typography>
            {!tooltip.inCOI && tooltip.ratio >= 2.996 && (
              <Typography variant="caption" sx={{ display: 'block', fontSize: '11px', color: 'text.secondary' }}>
                Cycle: {phaseLabel(tooltip.phase)}
              </Typography>
            )}
            {!tooltip.inCOI && tooltip.harmonicRatio > 0 && (
              <Typography variant="caption" sx={{
                display: 'block', fontSize: '11px',
                color: tooltip.harmonicRatio >= 2.996 ? (dark ? '#38bdf8' : '#0369a1') : 'text.secondary',
              }}>
                {`½-period harmonic: ${tooltip.harmonicRatio.toFixed(2)}×${tooltip.harmonicRatio >= 2.996 ? ' ✓' : ''}`}
                {tooltip.harmonicAsymmetry ? ` — ${tooltip.harmonicAsymmetry}` : ''}
              </Typography>
            )}
            {!tooltip.inCOI && tooltip.blobRank > 0 && (
              <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ display: 'block', fontSize: '11px', color: 'text.secondary' }}>
                  {`Pattern #${tooltip.blobRank} · ~${tooltip.blobPeriod} · ${tooltip.blobSpan}`}
                </Typography>
                {tooltip.blobChirp && (
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '11px', color: 'text.secondary' }}>
                    {tooltip.blobChirp}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );

  const xAxisJSX = (
    <Box sx={{ ml: '44px', position: 'relative', height: 20, mt: 0.5 }}>
      {xTicks
        .filter(({ pct }) => pct >= xView[0] && pct <= xView[1])
        .map(({ label, pct }) => {
          const pos = (pct - xView[0]) / (xView[1] - xView[0]);
          return (
            <Typography key={label} variant="caption" color="text.secondary" sx={{
              position: 'absolute', left: `${pos * 100}%`,
              transform: 'translateX(-50%)', fontSize: '10px', whiteSpace: 'nowrap',
            }}>
              {label}
            </Typography>
          );
        })}
    </Box>
  );

  const chartToolbar = (
    <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.25, zIndex: 5,
      bgcolor: dark ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.75)',
      borderRadius: 1, border: '1px solid', borderColor: 'divider', backdropFilter: 'blur(4px)', p: 0.25 }}>
      <Tooltip title="Zoom in" placement="top">
        <IconButton size="small" onClick={() => setXView(v => applyZoom(v, 0.5, 0.6))} sx={{ p: 0.5 }}>
          <ZoomInIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom out" placement="top">
        <IconButton size="small" onClick={() => setXView(v => applyZoom(v, 0.5, 1 / 0.6))} sx={{ p: 0.5 }}>
          <ZoomOutIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Reset zoom" placement="top">
        <span>
          <IconButton size="small" onClick={() => setXView([0, 1])} sx={{ p: 0.5 }} disabled={xView[0] === 0 && xView[1] === 1}>
            <RestoreIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );

  const legendJSX = (
    <Box sx={{ ml: '44px', mt: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>Low</Typography>
      <Box sx={{
        width: 180, height: 8, borderRadius: 1,
        background: 'linear-gradient(to right, #14072d, #57106d, #bc3754, #ed7926, #fbc12f, #fcffa4)',
      }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>High power</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', ml: 1 }}>
        — — cone of influence &nbsp;|&nbsp; grey = below 95% AR(1) significance &nbsp;|&nbsp; colour = significant
      </Typography>
    </Box>
  );

  return (
    <>
      <Head><title>Wavelet Analysis | Resident Frequency</title></Head>

      <Box component="main" sx={{
        flexGrow: 1, py: 4,
        backgroundColor: dark ? 'neutral.900' : 'neutral.100',
      }}>
        <Container maxWidth={settings.stretch ? false : 'xl'}>
          <Stack spacing={3}>

            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h4">Wavelet Analysis</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  When each cycle was active — Morlet CWT, full record, {formatPeriod(MIN_PERIOD)}–{formatPeriod(MAX_PERIOD)} periods
                </Typography>
              </Box>
              {loading && <CircularProgress size={20} />}
            </Stack>

            {error && <Typography color="error">{error}</Typography>}

            {/* Audio synthesis */}
            {cwtReady && (
              <Card>
                <CardHeader
                  title="Audio Synthesis"
                  subheader={`Sonify the scalogram — 6 h → ${AUDIO_F_MAX} Hz · 240 h → ${AUDIO_F_MIN} Hz · ${AUDIO_DURATION}s playback · stereo: temp (L) / dew point (R)`}
                />
                <CardContent>
                  <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                    <ButtonGroup size="small" disabled={audioLoading}>
                      {(['temp', 'dp', 'stereo'] as const).map(mode => {
                        const labels = { temp: 'Temperature', dp: 'Dew Point', stereo: 'Stereo' };
                        const active = audioPlaying === mode;
                        return (
                          <Button
                            key={mode}
                            variant={active ? 'contained' : 'outlined'}
                            onClick={() => active ? stopAudio() : playAudio(mode)}
                          >
                            {active ? `■ Stop` : `▶ ${labels[mode]}`}
                          </Button>
                        );
                      })}
                    </ButtonGroup>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={realPhase}
                          onChange={e => { if (!audioPlaying) setRealPhase(e.target.checked); }}
                          disabled={!!audioPlaying || audioLoading}
                        />
                      }
                      label={
                        <Typography variant="caption" color="text.secondary">
                          {realPhase ? 'Real phase — harmonic locking audible' : 'Free phase — amplitude only'}
                        </Typography>
                      }
                    />
                    {audioLoading && (
                      <Stack direction="row" alignItems="center" gap={1}>
                        <CircularProgress size={14} />
                        <Typography variant="caption" color="text.secondary">Synthesising…</Typography>
                      </Stack>
                    )}
                    {audioPlaying && !audioLoading && (
                      <Typography variant="caption" color="text.secondary">
                        Now playing — use headphones for stereo separation
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Temperature scalogram */}
            <Card>
              <CardHeader
                title="Temperature (°F)"
                subheader="Bright = high local power. Greyed = cone of influence (edge effects). Dashed lines = 12 h / 1 d / 2 d / 3 d / 1 w."
              />
              <CardContent sx={{ pb: '12px !important' }}>
                {canvasJSX(tempCanvasRef, tempResultRef, 'temp')}
                {xAxisJSX}
                {legendJSX}
              </CardContent>
            </Card>

            {/* Dew point scalogram */}
            <Card>
              <CardHeader
                title="Dew Point (°F)"
                subheader="Same time and period axis as temperature above."
              />
              <CardContent sx={{ pb: '12px !important' }}>
                {canvasJSX(dpCanvasRef, dpResultRef, 'dp')}
                {xAxisJSX}
                {legendJSX}
              </CardContent>
            </Card>

            {/* Reading guide */}
            <Card>
              <CardHeader title="How to read this chart" />
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="body2">
                    <strong>Horizontal bands</strong> are persistent cycles — a bright stripe at 24 h running the full width means the daily cycle is always present.
                  </Typography>
                  <Typography variant="body2">
                    <strong>Isolated bright patches</strong> are transient events — a cycle active for days or weeks then absent.
                  </Typography>
                  <Typography variant="body2">
                    <strong>Greyed regions</strong> (cone of influence) mark where the wavelet window extends beyond the data edge. Long-period results near the start and end of the record are unreliable.
                  </Typography>
                  <Typography variant="body2">
                    <strong>Grey pixels</strong> are below the 95% AR(1) significance threshold. Coloured pixels exceed 2.996× the expected red-noise background at that scale — hover to see the exact ratio.
                  </Typography>
                  <Typography variant="body2">
                    <strong>Period bands</strong> group the scale axis into physical regimes: short cycles (6–18 h) capture harmonics and brief thermal events; daily cycles (18–42 h) reflect solar-driven heating and cooling; weather fronts (42 h–5 d) correspond to Pacific low-pressure systems rolling through the Puget Sound region; weekly patterns (5–10 d) mark longer blocking events or persistent atmospheric regimes.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Method: Morlet CWT (w₀ = 6) via FFT convolution at {NUM_SCALES} log-spaced scales.
                    Background: AR(1) red noise (Torrence &amp; Compo 1998) — threshold rises at long periods so
                    drift and autocorrelation don&apos;t masquerade as significance.
                    Gap fill: linear ≤ 6 h, mean otherwise.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {/* Waveform lanes */}
            {(tempBlobs.length > 0 || dpBlobs.length > 0) && (
              <Card>
                <CardHeader
                  title="Reconstructed Waveforms by Frequency"
                  subheader="Each row is one identified period. Grey overlay = cone of influence."
                  action={
                    <Stack direction="row" spacing={1} sx={{ mt: 1, mr: 1 }}>
                      <ButtonGroup size="small" variant="outlined">
                        <Button onClick={() => setAmpMode('gated')} variant={ampMode === 'gated' ? 'contained' : 'outlined'}>Gated</Button>
                        <Button onClick={() => setAmpMode('power')} variant={ampMode === 'power' ? 'contained' : 'outlined'}>√p</Button>
                        <Button onClick={() => setAmpMode('snr')}   variant={ampMode === 'snr'   ? 'contained' : 'outlined'}>SNR</Button>
                      </ButtonGroup>
                      <ButtonGroup size="small" variant="outlined">
                        <Button onClick={() => setShowAllLanes(false)} variant={!showAllLanes ? 'contained' : 'outlined'}>Significant</Button>
                        <Button onClick={() => setShowAllLanes(true)}  variant={ showAllLanes ? 'contained' : 'outlined'}>All 50</Button>
                      </ButtonGroup>
                    </Stack>
                  }
                />
                <CardContent sx={{ pb: '12px !important' }}>
                  {tempBlobs.length > 0 && tempResultRef.current && (
                    <>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Temperature (°F)</Typography>
                      <Box sx={{ position: 'relative' }}>
                        {chartToolbar}
                        <WaveformLanesCanvas result={tempResultRef.current} blobs={tempBlobs} totalH={filled.dates.length} dark={dark} xView={xView} onXViewChange={handleXViewChange} ampMode={ampMode} showAllLanes={showAllLanes} />
                      </Box>
                      {xAxisJSX}
                    </>
                  )}
                  {dpBlobs.length > 0 && dpResultRef.current && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Dew Point (°F)</Typography>
                      <Box sx={{ position: 'relative' }}>
                        {chartToolbar}
                        <WaveformLanesCanvas result={dpResultRef.current} blobs={dpBlobs} totalH={filled.dates.length} dark={dark} xView={xView} onXViewChange={handleXViewChange} ampMode={ampMode} showAllLanes={showAllLanes} />
                      </Box>
                      {xAxisJSX}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Band interaction matrix */}
            {(tempBlobs.length > 0 || dpBlobs.length > 0) && (
              <Card>
                <CardHeader
                  title="Phase Locking Value Matrix"
                  subheader="PLV measures phase synchrony between bands at the nearest simple integer ratio (shown below each score). 1.0 = perfectly locked, 0 = independent. Brighter amber = stronger coupling."
                />
                <CardContent sx={{ pb: '12px !important' }}>
                  {tempBlobs.length >= 2 && tempResultRef.current && (
                    <>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Temperature (°F)</Typography>
                      <BandPLVMatrix result={tempResultRef.current} blobs={tempBlobs} totalH={filled.dates.length} dark={dark} />
                    </>
                  )}
                  {dpBlobs.length >= 2 && dpResultRef.current && (
                    <Box sx={{ mt: tempBlobs.length >= 2 ? 3 : 0 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Dew Point (°F)</Typography>
                      <BandPLVMatrix result={dpResultRef.current} blobs={dpBlobs} totalH={filled.dates.length} dark={dark} />
                    </Box>
                  )}
                  {(tempBlobs.length < 2 && dpBlobs.length < 2) && (
                    <Typography variant="body2" color="text.secondary">Need at least 2 significant bands to compute PLV.</Typography>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Export */}
            {cwtReady && (tempBlobs.length > 0 || dpBlobs.length > 0) && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="outlined" size="small" onClick={handleExportJSON}>
                  Export JSON for SuperCollider / VCV Rack
                </Button>
              </Box>
            )}

            {/* Patterns found */}
            {(tempBlobs.length > 0 || dpBlobs.length > 0) && (
              <Card>
                <CardHeader
                  title="Resident Frequencies & Events"
                  subheader="Organized by timescale — daily cycle, multi-day weather events, transients. Hover the scalogram to inspect any region."
                />
                <CardContent>

                  {/* ── Section 1: Daily Cycle ── */}
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                    Daily Cycle — Resident Frequency
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '12px' }}>
                    The ~24h cycle is not a discrete event — it is a standing frequency of the space, present whenever solar heating reaches the interior. Its on/off pattern over weeks is itself visible in the scalogram: when the diurnal band dims or disappears, the cycle is suppressed (overcast, closed shades, or building operating mode change). Whether that on/off pattern is itself periodic — recurring every 1–2 weeks — would show as power at multi-day scales concentrated near the diurnal row. A 12h harmonic (shown below if present) indicates the daily waveform is asymmetric: one side of the cycle is steeper than the other.
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
                    {([
                      { label: 'Temperature', blobs: tempBlobs, result: tempResultRef.current, channel: 'temp' as const },
                      { label: 'Dew Point',   blobs: dpBlobs,   result: dpResultRef.current,   channel: 'dp'   as const },
                    ] as const).map(({ label, blobs, result, channel }) => {
                      const diurnal  = blobs.filter(b => periodBandIndex(b.centroidPeriod) === 1);
                      const subDaily = blobs.filter(b => periodBandIndex(b.centroidPeriod) === 0);
                      const harmonics = subDaily
                        .filter(s => diurnal.some(d => blobsOverlap(s, d)))
                        .sort((a, b) => a.centroidPeriod - b.centroidPeriod);
                      if (diurnal.length === 0) return (
                        <Box key={label}>
                          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{label}</Typography>
                          <Typography variant="body2" color="text.secondary">No significant daily cycle detected.</Typography>
                        </Box>
                      );
                      const strongest      = diurnal.reduce((a, b) => b.peakRatio > a.peakRatio ? b : a);
                      const si24           = nearestScaleIdx(24);
                      const totalActiveH   = diurnal.reduce((s, b) => s + b.durationH, 0);
                      const totalActiveCyc = Math.round(totalActiveH / 24);
                      const totalD         = totalActiveH / 24;
                      const totalDurStr    = totalD >= 14 ? `${(totalD / 7).toFixed(1)}w` : `${Math.round(totalD)}d`;
                      const activePct      = Math.min(100, Math.round((totalActiveH / filled.dates.length) * 100));
                      const maxPeak        = diurnal.reduce((m, b) => Math.max(m, b.peakRatio), 0);
                      const totalSize      = diurnal.reduce((s, b) => s + b.size, 0);
                      const totalPwr       = diurnal.reduce((s, b) => s + b.totalPower, 0);
                      const tCenter        = Math.round(strongest.centroidT);
                      const tSparkMin      = Math.max(strongest.tMin, tCenter - 36);
                      const tSparkMax      = Math.min(strongest.tMax, tCenter + 36);
                      const harmActiveH    = harmonics.reduce((s, h) => s + h.durationH, 0);
                      const harmPct        = Math.round((harmActiveH / Math.max(1, totalActiveH)) * 100);
                      const strongestHarm  = harmonics.length > 0 ? harmonics.reduce((a, b) => b.peakRatio > a.peakRatio ? b : a) : null;
                      const asymDir        = result && strongestHarm ? harmonicAsymmetryForBlob(result, strongestHarm) : '';
                      return (
                        <Box key={label}>
                          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{label}</Typography>
                          <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: '1px solid', borderColor: 'divider' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Typography variant="body2" fontWeight={600} sx={{ fontSize: '12px' }}>
                                ~24h · {activePct}% of record
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px', ml: 1, whiteSpace: 'nowrap' }}>
                                {totalActiveCyc} cycles · {totalDurStr}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                              {physicalLabel(channel, 24)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                              {strengthLabel(maxPeak)} · {totalSize.toLocaleString()} scale-hr · Σ{Math.round(totalPwr).toLocaleString()}
                            </Typography>
                            {result && (
                              <Box sx={{ mb: 0.75 }}>
                                <CWTSparkline result={result} si={si24} tMin={tSparkMin} tMax={tSparkMax} dark={dark} width={200} height={32} />
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9px' }}>
                                  ↑ 3-day waveform at peak · strongest {strongest.peakRatio.toFixed(0)}× on {formatDateShort(strongest.datePeak)}
                                </Typography>
                              </Box>
                            )}
                            {harmonics.length > 0 ? (
                              <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '10px', fontWeight: 600 }}>
                                  12h harmonic: ~{harmPct}% of active time
                                </Typography>
                                {asymDir && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '10px' }}>
                                    {asymDir}
                                  </Typography>
                                )}
                                {harmonics.slice(0, 2).map(h => {
                                  const siH = nearestScaleIdx(h.centroidPeriod);
                                  const hCycles = (h.durationH / h.centroidPeriod).toFixed(1);
                                  const hDurStr = `${Math.round(h.durationH / 24)}d`;
                                  return (
                                    <Box key={h.id} sx={{ mt: 0.75 }}>
                                      <Stack direction="row" justifyContent="space-between">
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                                          ~{formatPeriod(h.centroidPeriod)} · {formatDateShort(h.dateStart)}–{formatDateShort(h.dateEnd)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                                          {hCycles} cyc · {hDurStr} · {strengthLabel(h.peakRatio)} · Σ{Math.round(h.totalPower).toLocaleString()}
                                        </Typography>
                                      </Stack>
                                      {result && (
                                        <Box sx={{ mt: 0.5 }}>
                                          <CWTSparkline result={result} si={siH} tMin={h.tMin} tMax={h.tMax} dark={dark} width={200} height={22} />
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9px' }}>
                                            ↑ ~{formatPeriod(h.centroidPeriod)} asymmetry waveform
                                          </Typography>
                                        </Box>
                                      )}
                                    </Box>
                                  );
                                })}
                              </Box>
                            ) : (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '10px', mt: 0.5 }}>
                                No significant 12h harmonic — waveform is roughly symmetric.
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>

                  {/* ── Section 2: Multi-day Weather Events ── */}
                  {(tempBlobs.some(b => periodBandIndex(b.centroidPeriod) >= 2) ||
                    dpBlobs.some(b => periodBandIndex(b.centroidPeriod) >= 2)) && (
                    <>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                        Multi-day Weather Events
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '12px' }}>
                        Each row is a <strong>resident frequency</strong> — a period that recurs across the record, not a single event. Groups within ~1.4× of each other are merged. Ranked by % of record active. Events with &gt;60% overlap with the active diurnal band are flagged as <strong>envelope modulation</strong> of the daily cycle. Outdoor data: NOAA KBFI (Boeing Field).
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
                        {([
                          { label: 'Temperature', blobs: tempBlobs, result: tempResultRef.current, channel: 'temp' as const, otherBlobs: dpBlobs },
                          { label: 'Dew Point',   blobs: dpBlobs,   result: dpResultRef.current,   channel: 'dp'   as const, otherBlobs: tempBlobs },
                        ] as const).map(({ label, blobs, result, channel, otherBlobs }) => {
                          const weatherBlobs = blobs.filter(b => periodBandIndex(b.centroidPeriod) >= 2);
                          const groups = groupBlobsByPeriod(weatherBlobs, filled.dates.length);
                          if (groups.length === 0) return (
                            <Box key={label}>
                              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{label}</Typography>
                              <Typography variant="body2" color="text.secondary">No significant multi-day patterns.</Typography>
                            </Box>
                          );
                          return (
                            <Box key={label}>
                              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{label}</Typography>
                              <Stack spacing={1.5}>
                                {groups.map((group, gi) => {
                                  const strongest  = group.blobs.reduce((a, b) => b.peakRatio > a.peakRatio ? b : a);
                                  const si         = nearestScaleIdx(group.period);
                                  const gap        = gapDescription(group);
                                  const durD       = group.totalActiveH / 24;
                                  const durStr     = durD >= 14 ? `${(durD / 7).toFixed(1)}w` : `${Math.round(durD)}d`;
                                  const extStats   = computeExternalStats(filled.dates, weatherMap, strongest.tMin, strongest.tMax);
                                  const linked     = otherBlobs.filter(o =>
                                    periodBandIndex(o.centroidPeriod) >= 2 &&
                                    group.blobs.some(b => blobsOverlap(o, b))
                                  );
                                  const hasSpread  = group.occurrences > 1 && (
                                    group.periodMin < group.period * 0.85 || group.periodMax > group.period * 1.15
                                  );
                                  return (
                                    <Box key={gi} sx={{ p: 1.25, borderRadius: 1, bgcolor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: '1px solid', borderColor: 'divider' }}>
                                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                        <Box>
                                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '12px' }}>
                                            ~{formatPeriod(group.period)} · {group.activePct}% of record
                                          </Typography>
                                          {hasSpread && (
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                                              range: {formatPeriod(group.periodMin)}–{formatPeriod(group.periodMax)}
                                            </Typography>
                                          )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px', ml: 1, whiteSpace: 'nowrap' }}>
                                          {group.occurrences} {group.occurrences === 1 ? 'occurrence' : 'occurrences'} · {durStr} total
                                        </Typography>
                                      </Stack>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                        {physicalLabel(channel, group.period)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                        {strengthLabel(group.maxPeak)} · {group.totalSize.toLocaleString()} scale-hr · Σ{Math.round(group.totalPower).toLocaleString()} · peak {group.maxPeak.toFixed(1)}×
                                      </Typography>
                                      {gap && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '10px', mt: 0.25 }}>
                                          {gap}
                                        </Typography>
                                      )}
                                      {result && (
                                        <Box sx={{ mt: 0.75, mb: 0.25 }}>
                                          <CWTSparkline result={result} si={si} tMin={strongest.tMin} tMax={strongest.tMax} dark={dark} width={180} height={32} />
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9px' }}>
                                            ↑ strongest occurrence: {formatDateShort(strongest.dateStart)}–{formatDateShort(strongest.dateEnd)} · peak {strongest.peakRatio.toFixed(1)}×
                                          </Typography>
                                        </Box>
                                      )}
                                      <Typography variant="caption" sx={{ display: 'block', fontSize: '10px', mt: 0.5, color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
                                        Outdoor (KBFI): {externalContextLine(extStats)}
                                      </Typography>
                                      {linked.length > 0 && (
                                        <Typography variant="caption" sx={{ display: 'block', fontSize: '10px', color: dark ? '#38bdf8' : '#0369a1' }}>
                                          Cross-channel: {channel === 'temp' ? 'dew point' : 'temperature'} also active at this timescale — coupled response
                                        </Typography>
                                      )}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Box>
                    </>
                  )}

                  {/* ── Section 3: Transients (6–18 h, isolated) ── */}
                  {([...tempBlobs, ...dpBlobs].some(b =>
                    periodBandIndex(b.centroidPeriod) === 0 &&
                    !([...tempBlobs, ...dpBlobs].filter(d => periodBandIndex(d.centroidPeriod) === 1).some(d => blobsOverlap(d, b)))
                  )) && (
                    <>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                        Transients (6–18 h, isolated)
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '12px' }}>
                        Sub-daily events occurring when the daily cycle is not active. These are not harmonics — they are isolated brief events: a cold snap, boiler restart, sudden window opening, or similar anomaly.
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                        {([
                          { label: 'Temperature', blobs: tempBlobs, result: tempResultRef.current, channel: 'temp' as const },
                          { label: 'Dew Point',   blobs: dpBlobs,   result: dpResultRef.current,   channel: 'dp'   as const },
                        ] as const).map(({ label, blobs, result, channel }) => {
                          const diurnal    = blobs.filter(b => periodBandIndex(b.centroidPeriod) === 1);
                          const transients = blobs
                            .filter(b => periodBandIndex(b.centroidPeriod) === 0 && !diurnal.some(d => blobsOverlap(d, b)))
                            .sort((a, b) => a.centroidPeriod - b.centroidPeriod);
                          if (transients.length === 0) return (
                            <Box key={label}>
                              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{label}</Typography>
                              <Typography variant="body2" color="text.secondary">None detected.</Typography>
                            </Box>
                          );
                          return (
                            <Box key={label}>
                              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{label}</Typography>
                              <Stack spacing={1.5}>
                                {transients.slice(0, 3).map(b => {
                                  const cycles = (b.durationH / b.centroidPeriod).toFixed(1);
                                  const durStr = `${Math.round(b.durationH)}h`;
                                  const si = nearestScaleIdx(b.centroidPeriod);
                                  return (
                                    <Box key={b.id} sx={{ p: 1.25, borderRadius: 1, bgcolor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: '1px solid', borderColor: 'divider' }}>
                                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '12px', color: dark ? '#f87171' : '#b91c1c' }}>
                                          Transient (~{formatPeriod(b.centroidPeriod)})
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px', ml: 1, whiteSpace: 'nowrap' }}>
                                          {cycles} cycles · {durStr}
                                        </Typography>
                                      </Stack>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                        {formatDateShort(b.dateStart)} – {formatDateShort(b.dateEnd)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                        {physicalLabel(channel, b.centroidPeriod)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                        {strengthLabel(b.peakRatio)} · {b.size.toLocaleString()} scale-hr · Σ{Math.round(b.totalPower).toLocaleString()} · peak {b.peakRatio.toFixed(1)}× on {formatDateShort(b.datePeak)}
                                      </Typography>
                                      {result && (
                                        <Box sx={{ mt: 0.75 }}>
                                          <CWTSparkline result={result} si={si} tMin={b.tMin} tMax={b.tMax} dark={dark} width={160} height={26} />
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9px' }}>
                                            ↑ ~{formatPeriod(b.centroidPeriod)} transient waveform
                                          </Typography>
                                        </Box>
                                      )}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Box>
                    </>
                  )}

                </CardContent>
              </Card>
            )}

          </Stack>
        </Container>
      </Box>
    </>
  );
};

WaveletPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;

export default WaveletPage;
