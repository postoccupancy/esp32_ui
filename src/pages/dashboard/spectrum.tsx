import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
  Unstable_Grid2 as Grid,
} from '@mui/material';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import FFT from 'fft.js';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_ESP32_API_BASE_URL ?? 'http://localhost:8000';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? '';

// ── Types ────────────────────────────────────────────────────────────────────

interface Aggregate {
  bucket_start: string;
  temp_f_avg: number | null;
  rh_avg: number | null;
}

interface SpectrumPoint {
  period: number; // hours
  power: number;
  m?: number;    // number of raw FFT bins averaged into this log-band
}

interface GapStats {
  rawCount: number;
  filledCount: number;
  gapCount: number;
  totalGapH: number;
  fillRate: number; // 0–100
}

// ── Constants ────────────────────────────────────────────────────────────────

const REFERENCE_PERIODS = [
  { period: 12,  label: '12 h' },
  { period: 24,  label: '1 day' },
  { period: 48,  label: '2 days' },
  { period: 72,  label: '3 days' },
  { period: 168, label: '1 week' },
];

const MAX_INTERPOLATE_H = 6; // gaps ≤ this are linearly interpolated; longer gaps filled with mean

// ── Helpers ──────────────────────────────────────────────────────────────────

// Magnus formula: converts temperature (°F) + relative humidity (%) → dew point (°F)
function rhToDewPoint(tempF: number, rh: number): number {
  const Tc    = (tempF - 32) * 5 / 9;
  const clampedRh = Math.max(1, Math.min(100, rh));
  const gamma = Math.log(clampedRh / 100) + 17.625 * Tc / (243.04 + Tc);
  return (243.04 * gamma / (17.625 - gamma)) * 9 / 5 + 32;
}

function nextPow2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function interpolateGaps(aggs: Aggregate[]): { filled: Aggregate[]; stats: GapStats } {
  if (aggs.length === 0) {
    return { filled: [], stats: { rawCount: 0, filledCount: 0, gapCount: 0, totalGapH: 0, fillRate: 100 } };
  }

  const tempMean =
    aggs.reduce((s, a) => s + (a.temp_f_avg ?? 0), 0) /
    Math.max(1, aggs.filter(a => a.temp_f_avg !== null).length);
  const rhMean =
    aggs.reduce((s, a) => s + (a.rh_avg ?? 0), 0) /
    Math.max(1, aggs.filter(a => a.rh_avg !== null).length);

  const result: Aggregate[] = [aggs[0]];
  let gapCount = 0;
  let totalGapH = 0;

  for (let i = 1; i < aggs.length; i++) {
    const prev = aggs[i - 1];
    const curr = aggs[i];
    const prevMs = new Date(prev.bucket_start).getTime();
    const currMs = new Date(curr.bucket_start).getTime();
    const gapH = (currMs - prevMs) / 3_600_000;

    if (gapH > 1.5) {
      gapCount++;
      const steps = Math.round(gapH) - 1;
      totalGapH += steps;

      for (let s = 1; s <= steps; s++) {
        const t = s / gapH;
        const ts = new Date(prevMs + s * 3_600_000).toISOString();

        if (gapH <= MAX_INTERPOLATE_H) {
          result.push({
            bucket_start: ts,
            temp_f_avg:
              prev.temp_f_avg !== null && curr.temp_f_avg !== null
                ? prev.temp_f_avg + t * (curr.temp_f_avg - prev.temp_f_avg)
                : (prev.temp_f_avg ?? curr.temp_f_avg ?? tempMean),
            rh_avg:
              prev.rh_avg !== null && curr.rh_avg !== null
                ? prev.rh_avg + t * (curr.rh_avg - prev.rh_avg)
                : (prev.rh_avg ?? curr.rh_avg ?? rhMean),
          });
        } else {
          result.push({ bucket_start: ts, temp_f_avg: tempMean, rh_avg: rhMean });
        }
      }
    }
    result.push(curr);
  }

  const spanH = (new Date(aggs[aggs.length - 1].bucket_start).getTime() - new Date(aggs[0].bucket_start).getTime()) / 3_600_000;
  const fillRate = spanH > 0 ? Math.round(100 * (1 - totalGapH / spanH)) : 100;

  return {
    filled: result,
    stats: { rawCount: aggs.length, filledCount: result.length, gapCount, totalGapH, fillRate },
  };
}

function computeSpectrum(values: number[]): SpectrumPoint[] {
  if (values.length < 8) return [];

  const N = nextPow2(values.length);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const fft = new FFT(N);
  const input = fft.createComplexArray();
  const output = fft.createComplexArray();

  values.forEach((v, i) => {
    input[2 * i] = v - mean;
    input[2 * i + 1] = 0;
  });

  fft.transform(output, input);

  const points: SpectrumPoint[] = [];
  for (let k = 1; k <= N / 2; k++) {
    const re = output[2 * k];
    const im = output[2 * k + 1];
    const power = Math.sqrt(re * re + im * im) / N;
    const period = N / k; // hours per cycle
    if (period >= 6 && period <= 300) {
      points.push({ period, power });
    }
  }

  return points.sort((a, b) => a.period - b.period);
}

// Group FFT bins into numBins equal-width log-period bands, averaging power per band.
// Produces uniform point spacing on a log-period axis regardless of FFT size.
function logBin(pts: SpectrumPoint[], numBins = 60): SpectrumPoint[] {
  if (pts.length === 0) return [];
  const logMin = Math.log2(6);
  const logMax = Math.log2(300);
  const width   = (logMax - logMin) / numBins;
  const result: SpectrumPoint[] = [];
  for (let i = 0; i < numBins; i++) {
    const lo = logMin + i * width;
    const hi = lo + width;
    const center = Math.pow(2, (lo + hi) / 2);
    const inBand = pts.filter(p => {
      const lp = Math.log2(p.period);
      return lp >= lo && lp < hi;
    });
    if (inBand.length > 0) {
      const mean = inBand.reduce((s, p) => s + p.power, 0) / inBand.length;
      result.push({ period: center, power: mean, m: inBand.length });
    }
  }
  return result;
}

function normalise(pts: SpectrumPoint[]): SpectrumPoint[] {
  const max = Math.max(...pts.map(p => p.power), 1e-9);
  return pts.map(p => ({ ...p, power: p.power / max }));
}

// Rolling-median background: for each bin, median power of all bins within
// ±smoothOctaves octaves in log₂ space. Adapts to any spectral shape.
function rollingMedianBackground(pts: SpectrumPoint[], smoothOctaves = 0.5): SpectrumPoint[] {
  const logP = pts.map(p => Math.log2(p.period));
  return pts.map((p, i) => {
    const lp = logP[i];
    const neighbors = pts
      .filter((_, j) => Math.abs(logP[j] - lp) <= smoothOctaves)
      .map(n => n.power)
      .sort((a, b) => a - b);
    const mid = Math.floor(neighbors.length / 2);
    const median = neighbors.length % 2 === 0
      ? (neighbors[mid - 1] + neighbors[mid]) / 2
      : neighbors[mid];
    return { period: p.period, power: Math.max(median, 1e-12) };
  });
}

function excessPower(pts: SpectrumPoint[], background: SpectrumPoint[]): SpectrumPoint[] {
  return pts.map((p, i) => ({ ...p, power: p.power / background[i].power }));
}

// Wilson-Hilferty approximation for chi-squared inverse CDF at p=0.95.
// Each log-bin averages m raw FFT bins → 2m degrees of freedom.
// Threshold = chi2inv(0.95, 2m) / (2m): the excess multiplier a bin must exceed
// to be significant at 95% confidence.
function chi2Threshold(m: number): number {
  const v = 2 * Math.max(m, 1);
  const z = 1.6448536; // norm_inv(0.95)
  const inner = 1 - 2 / (9 * v) + z * Math.sqrt(2 / (9 * v));
  return (v * Math.pow(inner, 3)) / v; // = chi2inv(0.95, v) / v
}

function significanceThreshold(pts: SpectrumPoint[]): SpectrumPoint[] {
  // Use actual bin count m when present; fall back to smooth model m ≈ C/period
  // only for empty bands (m=0) where no measured count exists.
  const valid = pts.filter(p => (p.m ?? 0) > 0);
  const C = valid.length > 0
    ? valid.reduce((s, p) => s + (p.m ?? 1) * p.period, 0) / valid.length
    : 10;
  return pts.map(p => ({
    period: p.period,
    power: chi2Threshold((p.m ?? 0) > 0 ? p.m! : C / p.period),
  }));
}

function formatPeriod(hours: number): string {
  if (hours >= 168) return `${(hours / 168).toFixed(2)}w`;
  if (hours >= 24)  return `${(hours / 24).toFixed(2)}d`;
  return `${hours.toFixed(1)}h`;
}

async function fetchAggregates(
  bucketSeconds: number,
  startTs: string,
  endTs?: string,
): Promise<Aggregate[]> {
  const p: Record<string, string> = {
    bucket: String(bucketSeconds),
    aggregate_mode: 'full',
    limit: '10000',
    order_desc: 'false',
    start_ts: `${startTs}T00:00:00Z`,
  };
  if (endTs) p.end_ts = `${endTs}T23:59:59Z`;

  const res = await fetch(`${API_BASE}/timeseries?${new URLSearchParams(p)}`, {
    headers: { 'X-Status-Token': API_TOKEN },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return (json.aggregates ?? []) as Aggregate[];
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SpectrumPage: NextPage = () => {
  usePageView();
  const settings = useSettings();

  const [allAggregates, setAllAggregates] = useState<Aggregate[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [startDate, setStartDate]         = useState('2026-01-01');
  const [endDate, setEndDate]             = useState('');
  const [corrected, setCorrected]         = useState(true);

  // Fetch the full record once — date pickers filter in memory, no re-fetch.
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAggregates(3600, '2025-11-01')
      .then(setAllAggregates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const aggregates = useMemo(() => {
    const startMs = startDate ? new Date(`${startDate}T00:00:00Z`).getTime() : 0;
    const endMs   = endDate   ? new Date(`${endDate}T23:59:59Z`).getTime()   : Infinity;
    return allAggregates.filter(a => {
      const t = new Date(a.bucket_start).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [allAggregates, startDate, endDate]);

  const { filled, stats } = useMemo(() => interpolateGaps(aggregates), [aggregates]);

  const rawTempSpectrum = useMemo(() => logBin(computeSpectrum(filled.map(a => a.temp_f_avg ?? 0))), [filled]);
  const rawDpSpectrum   = useMemo(() => logBin(computeSpectrum(
    filled.map(a => a.temp_f_avg !== null && a.rh_avg !== null ? rhToDewPoint(a.temp_f_avg, a.rh_avg) : 0)
  )), [filled]);

  const tempData = useMemo(() => {
    const bg      = rollingMedianBackground(rawTempSpectrum);
    const excess  = excessPower(rawTempSpectrum, bg);
    return {
      display:   corrected ? excess : normalise(rawTempSpectrum),
      top:       [...excess].sort((a, b) => b.power - a.power).slice(0, 6),
      threshold: significanceThreshold(rawTempSpectrum),
    };
  }, [rawTempSpectrum, corrected]);

  const dpData = useMemo(() => {
    const bg     = rollingMedianBackground(rawDpSpectrum);
    const excess = excessPower(rawDpSpectrum, bg);
    return {
      display:   corrected ? excess : normalise(rawDpSpectrum),
      top:       [...excess].sort((a, b) => b.power - a.power).slice(0, 6),
      threshold: significanceThreshold(rawDpSpectrum),
    };
  }, [rawDpSpectrum, corrected]);

  const series = useMemo(() => {
    const toXY = (pts: SpectrumPoint[]) =>
      pts.map(p => ({
        x: parseFloat(Math.log2(p.period).toFixed(5)),
        y: parseFloat(p.power.toFixed(5)),
      }));
    const base = [
      { name: 'Temperature (°F)', data: toXY(tempData.display) },
      { name: 'Dew Point (°F)',   data: toXY(dpData.display)  },
    ];
    if (corrected) {
      base.push({ name: '95% significance', data: toXY(tempData.threshold) });
    }
    return base;
  }, [tempData, dpData, corrected]);

  const chartOptions: ApexOptions = useMemo(() => ({
    chart: {
      type: 'line',
      toolbar: { show: true },
      animations: { enabled: false },
      background: 'transparent',
    },
    theme: { mode: settings.paletteMode },
    stroke: {
      curve: 'smooth',
      width:     corrected ? [1.5, 1.5, 1]  : [1.5, 1.5],
      dashArray: corrected ? [0,   0,   6]  : [0,   0],
    },
    colors: corrected ? ['#f59e0b', '#38bdf8', '#ef4444'] : ['#f59e0b', '#38bdf8'],
    legend: { show: true, position: 'top' },
    xaxis: {
      type: 'numeric',
      title: { text: 'Period (log₂ scale)' },
      tickAmount: 10,
      labels: { formatter: (v: string) => formatPeriod(Math.pow(2, parseFloat(v))) },
    },
    yaxis: {
      min: 0,
      ...(corrected ? {} : { max: 1 }),
      title: { text: corrected ? '× background' : 'Relative power (0–1)' },
      labels: { formatter: (v: number) => v.toFixed(2) },
    },
    annotations: {
      xaxis: REFERENCE_PERIODS.map(({ period, label }) => ({
        x: Math.log2(period),
        borderColor: '#555',
        strokeDashArray: 4,
        label: {
          text: label,
          position: 'top',
          orientation: 'horizontal',
          style: {
            fontSize: '10px',
            background: 'transparent',
            color: '#888',
            cssClass: 'apexcharts-xaxis-annotation-label',
          },
        },
      })),
    },
    tooltip: {
      shared: true,
      x: { formatter: (v: number) => formatPeriod(Math.pow(2, v)) },
      y: { formatter: (v: number) => v.toFixed(4) },
    },
    grid: { borderColor: '#333' },
  }), [settings.paletteMode, corrected]);

  const fillColor = stats.fillRate >= 95 ? 'success' : stats.fillRate >= 85 ? 'warning' : 'error';

  return (
    <>
      <Head>
        <title>Spectrum Analysis | Resident Frequency</title>
      </Head>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          py: 4,
          backgroundColor: settings.paletteMode === 'dark' ? 'neutral.900' : 'neutral.100',
        }}
      >
        <Container maxWidth={settings.stretch ? false : 'xl'}>
          <Stack spacing={3}>

            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h4">Spectrum Analysis</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {corrected
                    ? 'Recurring cycles in temperature and dew point — excess power above red noise background'
                    : 'Recurring cycles in temperature and dew point — both series normalised to peak = 1'}
                </Typography>
              </Box>

              <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                <TextField
                  type="date"
                  label="Start date"
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <TextField
                  type="date"
                  label="End date"
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  inputProps={{ min: startDate }}
                />
                <ButtonGroup size="small">
                  <Button
                    variant={!corrected ? 'contained' : 'outlined'}
                    onClick={() => setCorrected(false)}
                  >
                    Raw
                  </Button>
                  <Button
                    variant={corrected ? 'contained' : 'outlined'}
                    onClick={() => setCorrected(true)}
                  >
                    Background-corrected
                  </Button>
                </ButtonGroup>
              </Stack>
            </Stack>

            {/* Power spectrum chart */}
            <Card>
              <CardHeader
                title="Power Spectrum"
                subheader={
                  aggregates.length
                    ? `${stats.rawCount} hourly samples · ${stats.gapCount} gaps (${stats.totalGapH}h) filled · ${corrected ? 'background-corrected: red noise slope removed' : 'raw spectrum: long periods boosted by red noise slope'} · dashed lines = reference periods`
                    : 'Loading…'
                }
                action={
                  aggregates.length ? (
                    <Chip
                      label={`${stats.fillRate}% fill rate`}
                      color={fillColor}
                      size="small"
                      sx={{ mt: 1, mr: 1 }}
                    />
                  ) : null
                }
              />
              <CardContent>
                {loading && (
                  <Box display="flex" justifyContent="center" py={10}>
                    <CircularProgress />
                  </Box>
                )}
                {error && <Typography color="error" variant="body2">{error}</Typography>}
                {!loading && !error && (
                  <Chart type="line" height={420} options={chartOptions} series={series} />
                )}
              </CardContent>
            </Card>

            {/* Top cycles tables */}
            {!loading && !error && (
              <Grid container spacing={3}>
                <Grid xs={12} md={6}>
                  <Card>
                    <CardHeader
                      title="Strongest cycles — Temperature"
                      subheader="Ranked by excess above red noise background"
                    />
                    <CardContent>
                      <Stack spacing={1.5}>
                        {tempData.top.map((p, i) => (
                          <Stack key={i} direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography variant="body2" fontWeight={500}>{formatPeriod(p.period)}</Typography>
                              <Typography variant="caption" color="text.secondary">{p.period.toFixed(1)} hours</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">{p.power.toFixed(1)}× background</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12} md={6}>
                  <Card>
                    <CardHeader
                      title="Strongest cycles — Dew Point"
                      subheader="Ranked by excess above red noise background"
                    />
                    <CardContent>
                      <Stack spacing={1.5}>
                        {dpData.top.map((p, i) => (
                          <Stack key={i} direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography variant="body2" fontWeight={500}>{formatPeriod(p.period)}</Typography>
                              <Typography variant="caption" color="text.secondary">{p.period.toFixed(1)} hours</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">{p.power.toFixed(1)}× background</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}

          </Stack>
        </Container>
      </Box>
    </>
  );
};

SpectrumPage.getLayout = (page) => (
  <DashboardLayout>{page}</DashboardLayout>
);

export default SpectrumPage;
