import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
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
}

type MetricKey = 'temp_f_avg' | 'rh_avg';

// ── Constants ────────────────────────────────────────────────────────────────

const REFERENCE_PERIODS = [
  { period: 12,  label: '12h' },
  { period: 24,  label: '1 day' },
  { period: 48,  label: '2 days' },
  { period: 72,  label: '3 days' },
  { period: 168, label: '1 week' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function computeSpectrum(values: number[]): SpectrumPoint[] {
  if (values.length < 8) return [];

  const N = nextPow2(values.length);

  // Remove DC (mean) before transform
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const fft = new FFT(N);
  const input = fft.createComplexArray();
  const output = fft.createComplexArray();

  values.forEach((v, i) => {
    input[2 * i] = v - mean;
    input[2 * i + 1] = 0;
  });
  // Remaining (padded) entries are already 0

  fft.transform(output, input);

  const points: SpectrumPoint[] = [];
  // dt = 1 hour (hourly buckets), so period = N / k hours
  for (let k = 1; k <= N / 2; k++) {
    const re = output[2 * k];
    const im = output[2 * k + 1];
    const power = Math.sqrt(re * re + im * im) / N;
    const period = N / k; // hours

    // Only include periods in the musically interesting range: 6h – 300h
    if (period >= 6 && period <= 300) {
      points.push({ period, power });
    }
  }

  return points.sort((a, b) => a.period - b.period);
}

function formatPeriod(hours: number): string {
  if (hours >= 168) return `${(hours / 168).toFixed(2)}w`;
  if (hours >= 24)  return `${(hours / 24).toFixed(2)}d`;
  return `${hours.toFixed(1)}h`;
}

async function fetchAggregates(bucketSeconds: number): Promise<Aggregate[]> {
  const params = new URLSearchParams({
    bucket: String(bucketSeconds),
    aggregate_mode: 'full',
    limit: '10000',
    order_desc: 'false',
    start_ts: '2025-11-01T00:00:00',
  });

  const res = await fetch(`${API_BASE}/timeseries?${params}`, {
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

  const [aggregates, setAggregates] = useState<Aggregate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [metric, setMetric]         = useState<MetricKey>('temp_f_avg');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAggregates(3600)
      .then(setAggregates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const spectrum = useMemo(() => {
    if (!aggregates.length) return [];
    const values = aggregates
      .map(a => a[metric])
      .filter((v): v is number => v !== null && v !== undefined);
    return computeSpectrum(values);
  }, [aggregates, metric]);

  const topCycles = useMemo(
    () => [...spectrum].sort((a, b) => b.power - a.power).slice(0, 8),
    [spectrum]
  );

  const chartOptions: ApexOptions = useMemo(() => ({
    chart: {
      type: 'area',
      toolbar: { show: true },
      animations: { enabled: false },
      background: 'transparent',
    },
    theme: { mode: settings.paletteMode },
    stroke: { curve: 'smooth', width: 1.5 },
    fill: {
      type: 'gradient',
      gradient: { opacityFrom: 0.35, opacityTo: 0.02 },
    },
    xaxis: {
      type: 'numeric',
      title: { text: 'Period' },
      tickAmount: 12,
      labels: {
        formatter: (v: string) => formatPeriod(parseFloat(v)),
      },
    },
    yaxis: {
      title: { text: 'Power (relative amplitude)' },
      labels: { formatter: (v: number) => v.toFixed(3) },
    },
    annotations: {
      xaxis: REFERENCE_PERIODS.map(({ period, label }) => ({
        x: period,
        borderColor: '#888888',
        strokeDashArray: 4,
        label: {
          text: label,
          position: 'top',
          style: {
            fontSize: '11px',
            background: 'transparent',
            color: '#888888',
          },
        },
      })),
    },
    tooltip: {
      x: { formatter: (v: number) => formatPeriod(v) },
      y: { formatter: (v: number) => v.toFixed(4) },
    },
    grid: { borderColor: '#333' },
  }), [settings.paletteMode]);

  const series = useMemo(() => [{
    name: metric === 'temp_f_avg' ? 'Temperature power' : 'Humidity power',
    data: spectrum.map(p => ({
      x: parseFloat(p.period.toFixed(2)),
      y: parseFloat(p.power.toFixed(5)),
    })),
  }], [spectrum, metric]);

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
          backgroundColor: settings.paletteMode === 'dark'
            ? 'neutral.900'
            : 'neutral.100',
        }}
      >
        <Container maxWidth={settings.stretch ? false : 'xl'}>
          <Stack spacing={3}>

            {/* Header */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap={2}
            >
              <Box>
                <Typography variant="h4">Spectrum Analysis</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Recurring cycles in environmental sensor data
                </Typography>
              </Box>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Metric</InputLabel>
                <Select
                  value={metric}
                  label="Metric"
                  onChange={e => setMetric(e.target.value as MetricKey)}
                >
                  <MenuItem value="temp_f_avg">Temperature (°F)</MenuItem>
                  <MenuItem value="rh_avg">Humidity (%RH)</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Power spectrum chart */}
            <Card>
              <CardHeader
                title="Power Spectrum"
                subheader={
                  aggregates.length
                    ? `${aggregates.length} hourly samples · peaks indicate recurring cycles`
                    : 'Loading…'
                }
              />
              <CardContent>
                {loading && (
                  <Box display="flex" justifyContent="center" py={10}>
                    <CircularProgress />
                  </Box>
                )}
                {error && (
                  <Typography color="error" variant="body2">{error}</Typography>
                )}
                {!loading && !error && (
                  <Chart
                    type="area"
                    height={420}
                    options={chartOptions}
                    series={series}
                  />
                )}
              </CardContent>
            </Card>

            {/* Top cycles table */}
            {!loading && !error && topCycles.length > 0 && (
              <Grid container spacing={3}>
                <Grid xs={12} md={6}>
                  <Card>
                    <CardHeader
                      title="Strongest Cycles"
                      subheader="Dominant periodic signals, highest power first"
                    />
                    <CardContent>
                      <Stack spacing={1.5}>
                        {topCycles.map((p, i) => (
                          <Stack
                            key={i}
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Box>
                              <Typography variant="body2" fontWeight={500}>
                                {formatPeriod(p.period)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {p.period.toFixed(1)} hours
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {p.power.toFixed(4)}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12} md={6}>
                  <Card>
                    <CardHeader
                      title="Reference Periods"
                      subheader="Named cycles marked on the spectrum"
                    />
                    <CardContent>
                      <Stack spacing={1.5}>
                        {REFERENCE_PERIODS.map(({ period, label }) => {
                          const nearest = spectrum.reduce((best, p) =>
                            Math.abs(p.period - period) < Math.abs(best.period - period) ? p : best,
                            spectrum[0]
                          );
                          return (
                            <Stack
                              key={label}
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography variant="body2" fontWeight={500}>
                                {label}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                power {nearest?.power.toFixed(4) ?? '—'}
                              </Typography>
                            </Stack>
                          );
                        })}
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
