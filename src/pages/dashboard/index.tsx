/* eslint-disable react/jsx-max-props-per-line */
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import PlusIcon from '@untitled-ui/icons-react/build/esm/Plus';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  SvgIcon,
  Typography,
  Unstable_Grid2 as Grid,
  useTheme,
  Card,
  CardHeader,
  CardContent,
  FormControlLabel,
  Switch
} from '@mui/material';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { TimeContextControls } from '../../components/time-context-controls';
import { useTimeContext, type ThresholdBandKey, type ThresholdPreset } from '../../contexts/time-context';
import { AnalyticsStats } from '../../sections/dashboard/analytics/analytics-stats';
import { AnalyticsMostVisited } from '../../sections/dashboard/analytics/analytics-most-visited';
import { AnalyticsSocialSources } from '../../sections/dashboard/analytics/analytics-social-sources';
import { AnalyticsTrafficSources } from '../../sections/dashboard/analytics/analytics-traffic-sources';
import { AnalyticsVisitsByCountry } from '../../sections/dashboard/analytics/analytics-visits-by-country';
import ArrowRightIcon from '@untitled-ui/icons-react/build/esm/ArrowRight';
import { EcommerceSalesRevenue } from 'src/sections/dashboard/ecommerce/ecommerce-sales-revenue';
import { EcommerceStats } from 'src/sections/dashboard/ecommerce/ecommerce-stats';
import { useESP32Aggregates, useESP32Summary, useWeatherHourly } from '@/hooks/use-esp32';
import { buildSparseTimeAxisLabels } from '@/utils/chart-utils';
import {
  computeHourlyBaselineCurve,
  computeRegionBaselineSummary,
  REGION_LABEL
} from '@/utils/compute-hourly-baseline';
import { get } from 'lodash';
import { CryptoWallet } from '@/sections/dashboard/crypto/crypto-wallet';
import { MetricCard } from '@/sections/dashboard/temperature/metric-card';
import { computeMetricsSummary } from '@/sections/dashboard/temperature/compute-metrics-summary';
import { AlertsTable } from '../components/alerts-table';
import { TimeSeriesChart } from '../components/time-series';
import { AlertDetailsDrawer } from '../../sections/dashboard/alerts/alert-details-drawer';
import type { Alert } from '../../types/alert';
import type { ApexOptions } from 'apexcharts';
import { Chart } from '@/components/chart';

export type ESP32AggregateSeriesKey =
  | 'temp_c_avg'
  | 'temp_c_min'
  | 'temp_c_max'
  | 'temp_f_avg'
  | 'temp_f_min'
  | 'temp_f_max'
  | 'rh_avg'
  | 'rh_min'
  | 'rh_max';

const THRESHOLD_PRESETS = [0.05, 0.1, 0.15, 0.2, 0.25] as const;
const MAIN_TIME_SERIES_HEIGHT = 320;
const MOISTURE_CHART_HEIGHT = 360;
const THRESHOLD_BAND_OPTIONS: Array<{ key: ThresholdBandKey; label: string }> = [
  { key: 'temp', label: 'Temperature (baseline)' },
  { key: 'moisture', label: 'Moisture (baseline)' },
  { key: 'rh_expected', label: 'Humidity (expected)' },
];
const BASELINE_DEFAULT_WINDOW_DAYS = 30;
const BASELINE_DEFAULT_BUCKET_SECONDS = 3600;
const WEATHER_PAGE_LIMIT = 500;

const classifyDelta = (delta: number, neutralBand: number, positiveWord: string, negativeWord: string): string => {
  if (Math.abs(delta) <= neutralBand) return 'about average';
  if (delta > 0) return positiveWord;
  return negativeWord;
};

const buildEnvelopePath = (
  upper: Array<number | null>,
  lower: Array<number | null>,
  plot: { left: number; top: number; width: number; height: number },
  yMin: number,
  yMax: number
) => {
  const span = yMax - yMin || 1;
  const n = Math.min(upper.length, lower.length);
  if (n < 2 || !plot.width || !plot.height) return null;
  const upperPts: string[] = [];
  const lowerPts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const hi = upper[i];
    const lo = lower[i];
    if (typeof hi !== 'number' || typeof lo !== 'number') return null;
    const x = plot.left + (i / (n - 1)) * plot.width;
    const yHi = plot.top + (1 - (hi - yMin) / span) * plot.height;
    const yLo = plot.top + (1 - (lo - yMin) / span) * plot.height;
    upperPts.push(`${x},${yHi}`);
    lowerPts.push(`${x},${yLo}`);
  }
  return `M ${upperPts.join(' L ')} L ${lowerPts.reverse().join(' L ')} Z`;
};

const Page: NextPage = () => {
  const settings = useSettings();
  const theme = useTheme();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const moistureChartFrameRef = useRef<HTMLDivElement | null>(null);
  const [selectedOverviewAlert, setSelectedOverviewAlert] = useState<Alert | null>(null);
  const [hoveredOverviewAlert, setHoveredOverviewAlert] = useState<Alert | null>(null);
  const [normalizedDeviationView, setNormalizedDeviationView] = useState<boolean>(false);
  const [mirrorRhView, setMirrorRhView] = useState<boolean>(false);
  const [enablePrevSummaryQuery, setEnablePrevSummaryQuery] = useState<boolean>(false);
  const [moisturePlotBounds, setMoisturePlotBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);
  usePageView();

  const { from, to, bucketLabel, bucketValue, window, thresholdPct, setThresholdPct, thresholdBands, setThresholdBands } = useTimeContext();
  const windowMS = to.getTime() - from.getTime();
  const windowDays = windowMS / (1000 * 60 * 60 * 24);
  const weatherMaxPages = useMemo(() => {
    // NWS /observations returns raw station observations (not hourly aggregates).
    // We aggregate hourly in esp32_api, so we fetch enough raw pages to cover the
    // selected window. Keep this adaptive to avoid over-fetching short windows.
    if (window === '30d') return 100;
    if (window === '7d') return 30;
    if (window === '24h') return 10;
    return 5;
  }, [window]);

  const { data } = useESP32Aggregates(
    {
      start_ts: from.toISOString(),
      end_ts: to.toISOString(),
      bucket: bucketValue,
      order_desc: false,
      limit: 1000,
      aggregate_mode: 'lite',
    },
    {
      staleTime: 60_000,
    }
  );
  const aggregates = useMemo(() => data?.aggregates || [], [data]);
  const { data: weatherData } = useWeatherHourly(
    {
      provider: 'noaa',
      start_ts: from.toISOString(),
      end_ts: to.toISOString(),
      station: 'KBFI',
      tz: 'America/Los_Angeles',
      page_limit: WEATHER_PAGE_LIMIT,
      max_pages: weatherMaxPages,
    },
    {
      staleTime: 10 * 60_000,
    }
  );
  const { data: openMeteoData } = useWeatherHourly(
    {
      provider: 'openmeteo',
      start_ts: from.toISOString(),
      end_ts: to.toISOString(),
      // Approximate coordinate for 409 16th Ave E, Seattle
      latitude: 47.6225,
      longitude: -122.3118,
      tz: 'America/Los_Angeles',
    },
    {
      staleTime: 10 * 60_000,
    }
  );

  useEffect(() => {
    // Reset deferred previous-period summary fetch whenever primary window changes.
    setEnablePrevSummaryQuery(false);
  }, [from, to]);

  useEffect(() => {
    if (!aggregates.length || enablePrevSummaryQuery) {
      return;
    }
    // Let primary queries paint first; previous-period summary is secondary.
    const timerId = globalThis.window?.setTimeout(() => {
      setEnablePrevSummaryQuery(true);
    }, 1200);

    return () => {
      if (timerId) {
        globalThis.window.clearTimeout(timerId);
      }
    };
  }, [aggregates.length, enablePrevSummaryQuery]);


  // For comparison, fetch the previous window summary
  const prevTo = useMemo(() => new Date(from.getTime()), [from]);
  const prevFrom = useMemo(() => new Date(from.getTime() - windowMS), [from, windowMS]);

  const { data: prevSummaryData } = useESP32Summary(
    {
      start_ts: prevFrom.toISOString(),
      end_ts: prevTo.toISOString(),
    },
    {
      enabled: enablePrevSummaryQuery,
      staleTime: 120_000,
    }
  );
  const prevSummary = prevSummaryData?.summary;
  const hasPrevSummaryData = typeof prevSummary?.count === 'number' && prevSummary.count > 0;

  const baselineTo = to;
  const baselineFrom = useMemo(
    () => new Date(baselineTo.getTime() - BASELINE_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    [baselineTo]
  );
  const mainMatchesBaselineWindow =
    bucketValue === BASELINE_DEFAULT_BUCKET_SECONDS &&
    Math.abs(from.getTime() - baselineFrom.getTime()) < 1000 &&
    Math.abs(to.getTime() - baselineTo.getTime()) < 1000;

  const { data: baselineData } = useESP32Aggregates(
    {
      start_ts: baselineFrom.toISOString(),
      end_ts: baselineTo.toISOString(),
      bucket: BASELINE_DEFAULT_BUCKET_SECONDS,
      order_desc: false,
      limit: 1000,
      aggregate_mode: 'lite',
    },
    {
      enabled: !mainMatchesBaselineWindow,
      staleTime: 5 * 60_000,
    }
  );
  const baselineAggregates = useMemo(
    () => (mainMatchesBaselineWindow ? aggregates : baselineData?.aggregates ?? []),
    [aggregates, baselineData?.aggregates, mainMatchesBaselineWindow]
  );

  const baselineByHour = useMemo(
    () => computeHourlyBaselineCurve(baselineAggregates),
    [baselineAggregates]
  );

  const baselineRegionSummary = useMemo(
    () => computeRegionBaselineSummary(aggregates, baselineAggregates),
    [aggregates, baselineAggregates]
  );


  const tooltipCategories = useMemo(() => {
    return aggregates.map((agg) => {
      const d = new Date(agg.bucket_start);
      return d.toLocaleTimeString([], {
        weekday: windowDays > 1 ? 'short' : undefined,
        month: windowDays > 1 ? 'short' : undefined,
        day: windowDays > 1 ? 'numeric' : undefined,
        hour: 'numeric',
        minute: bucketValue < 3600 ? '2-digit' : undefined,
        second: bucketValue < 60 ? '2-digit' : undefined,
      });
    });
  }, [aggregates, windowDays, bucketValue]);

  const bucketStarts = useMemo(
    () => aggregates.map((agg) => agg.bucket_start),
    [aggregates]
  );

  const xAxisLabels = useMemo(
    () => buildSparseTimeAxisLabels(bucketStarts, window),
    [bucketStarts, window]
  );

  const toAbsoluteHumidity = useCallback((tempF: number | null | undefined, rh: number | null | undefined) => {
    if (typeof tempF !== 'number' || typeof rh !== 'number') return null;
    const tempC = (tempF - 32) * (5 / 9);
    const saturationVp = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5)); // hPa
    const absoluteHumidity = (saturationVp * rh * 2.1674) / (273.15 + tempC); // g/m^3
    return Number.isFinite(absoluteHumidity) ? absoluteHumidity : null;
  }, []);

  const repeatingBaselineOverlay = useMemo(() => {
    if (!aggregates.length || baselineByHour.tempSeries.length !== 24 || baselineByHour.rhSeries.length !== 24) {
      return [];
    }

    const tempOverlay = aggregates.map((agg) => {
      const hour = new Date(agg.bucket_start).getHours();
      return baselineByHour.tempSeries[hour] ?? null;
    });
    const rhOverlay = aggregates.map((agg) => {
      const hour = new Date(agg.bucket_start).getHours();
      return baselineByHour.rhSeries[hour] ?? null;
    });

    const moistureOverlay = aggregates.map((agg) => {
      const hour = new Date(agg.bucket_start).getHours();
      return toAbsoluteHumidity(
        baselineByHour.tempSeries[hour] ?? null,
        baselineByHour.rhSeries[hour] ?? null
      );
    });

    return [
      {
        name: 'Temperature Baseline (30d hour-of-day)',
        data: tempOverlay
      },
      {
        name: 'RH Baseline (30d hour-of-day)',
        data: rhOverlay
      },
      {
        name: 'Absolute Moisture Baseline (30d hour-of-day)',
        data: moistureOverlay
      }
    ];
  }, [aggregates, baselineByHour, toAbsoluteHumidity]);

  const baselineTrailingHourOrder = useMemo(() => {
    if (baselineByHour.tempSeries.length !== 24 || baselineByHour.rhSeries.length !== 24) {
      return [];
    }
    const endHour = to.getHours(); // most recent hour bucket
    return Array.from({ length: 24 }, (_, i) => ((endHour - 23 + i) % 24 + 24) % 24);
  }, [baselineByHour.rhSeries.length, baselineByHour.tempSeries.length, to]);

  const baselineTrailingCategories = useMemo(
    () => baselineTrailingHourOrder.map((hourIdx) => baselineByHour.categories[hourIdx] ?? ''),
    [baselineByHour.categories, baselineTrailingHourOrder]
  );
  const expectedRhHourOfDaySeries = useMemo(() => {
    const tempSeries = baselineByHour.tempSeries;
    const rhSeries = baselineByHour.rhSeries;
    const tempValues = tempSeries.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const rhValues = rhSeries.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const meanTemp = tempValues.length ? tempValues.reduce((sum, v) => sum + v, 0) / tempValues.length : null;
    const meanRh = rhValues.length ? rhValues.reduce((sum, v) => sum + v, 0) / rhValues.length : null;
    if (typeof meanTemp !== 'number' || meanTemp === 0 || typeof meanRh !== 'number') {
      return tempSeries.map(() => null);
    }
    return tempSeries.map((temp) => {
      if (typeof temp !== 'number') return null;
      const tempDeviation = (temp - meanTemp) / meanTemp;
      const expectedRh = meanRh * (1 - tempDeviation);
      return Number.isFinite(expectedRh) ? expectedRh : null;
    });
  }, [baselineByHour.rhSeries, baselineByHour.tempSeries]);

  const baselineTrailingTimestamps = useMemo(() => {
    const end = new Date(to);
    end.setMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(end);
      d.setHours(end.getHours() - (23 - i));
      return d.toISOString();
    });
  }, [to]);

  const baselineChartSeries = useMemo(
    () => {
      const tempSeries = baselineTrailingHourOrder.map((hourIdx) => baselineByHour.tempSeries[hourIdx] ?? null);
      const rhSeries = baselineTrailingHourOrder.map((hourIdx) => baselineByHour.rhSeries[hourIdx] ?? null);
      const expectedRhSeries = baselineTrailingHourOrder.map((hourIdx) => expectedRhHourOfDaySeries[hourIdx] ?? null);
      const moistureSeries = tempSeries.map((temp, i) => toAbsoluteHumidity(temp, rhSeries[i] ?? null));
      return [
        {
          name: 'Temperature Baseline (°F)',
          data: tempSeries
        },
        {
          name: 'RH Baseline (%)',
          data: rhSeries
        },
        {
          name: 'Expected RH Baseline (%)',
          data: expectedRhSeries
        },
        {
          name: 'Moisture Baseline (g/m³)',
          data: moistureSeries
        }
      ];
    },
    [baselineByHour.rhSeries, baselineByHour.tempSeries, baselineTrailingHourOrder, expectedRhHourOfDaySeries, toAbsoluteHumidity]
  );

  const baselineChartXAxisLabels = useMemo(
    () => buildSparseTimeAxisLabels(baselineTrailingTimestamps, '24h'),
    [baselineTrailingTimestamps]
  );
  
  const round = useCallback((value: number | null | undefined, decimals = 1) => {
    if (value == null) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }, []);


  const getSeries = useCallback((key: ESP32AggregateSeriesKey) => {
    return aggregates.map((agg) => round(agg[key] as number | null | undefined));
  }, [aggregates, round]);

  

  const analyticsMetrics = useMemo(() => {
    return computeMetricsSummary(aggregates, bucketValue);
  }, [aggregates, bucketValue]);

  const currentTempMean = analyticsMetrics.tempMean;
  const currentRhMean = analyticsMetrics.rhMean;
  const currentTempMin = analyticsMetrics.tempMin;
  const currentTempMax = analyticsMetrics.tempMax;
  const currentRhMin = analyticsMetrics.rhMin;
  const currentRhMax = analyticsMetrics.rhMax;


  const percentChange = (current: number, previous: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) {
    if (current === 0) return 0;
    return 100; // or return 0 if you prefer to avoid spikes on zero baseline
  }
    return Math.round(((current - previous) / previous) * 1000) / 10; // 1 decimal
  };


  const tempRate = hasPrevSummaryData ? percentChange(currentTempMean, prevSummary?.temp_f_avg ?? 0) : 0;
  const rhRate = hasPrevSummaryData ? percentChange(currentRhMean, prevSummary?.rh_avg ?? 0) : 0;
  const activeHighlightedAlert = hoveredOverviewAlert ?? selectedOverviewAlert;
  const mainChartHighlightRange = useMemo(
    () => (
      activeHighlightedAlert?.startAt && activeHighlightedAlert?.endAt
        ? { startMs: activeHighlightedAlert.startAt, endMs: activeHighlightedAlert.endAt }
        : null
    ),
    [activeHighlightedAlert?.endAt, activeHighlightedAlert?.startAt]
  );
  const moistureMaskPercents = useMemo(() => {
    if (!mainChartHighlightRange || bucketStarts.length < 2) {
      return null;
    }

    const pointMs = bucketStarts.map((iso) => new Date(iso).getTime());
    const inferredBucketMs = pointMs.length > 1
      ? Math.max(1, Math.abs(pointMs[1] - pointMs[0]))
      : Math.max(1, mainChartHighlightRange.endMs - mainChartHighlightRange.startMs);

    let firstOverlapIndex: number | null = null;
    let lastOverlapIndex: number | null = null;

    for (let i = 0; i < pointMs.length; i += 1) {
      const bucketStartMs = pointMs[i];
      const bucketEndMs = bucketStartMs + inferredBucketMs;
      const overlaps =
        bucketEndMs > mainChartHighlightRange.startMs &&
        bucketStartMs < mainChartHighlightRange.endMs;

      if (!overlaps) continue;
      if (firstOverlapIndex == null) firstOverlapIndex = i;
      lastOverlapIndex = i;
    }

    if (firstOverlapIndex == null || lastOverlapIndex == null) {
      return null;
    }

    const bucketCount = pointMs.length;
    const leftPct = (firstOverlapIndex / bucketCount) * 100;
    const rightPct = ((bucketCount - (lastOverlapIndex + 1)) / bucketCount) * 100;
    return {
      leftPct: Math.max(0, Math.min(100, leftPct)),
      rightPct: Math.max(0, Math.min(100, rightPct)),
    };
  }, [bucketStarts, mainChartHighlightRange]);
  const thresholdBandVisibility = useMemo(
    () => ({
      temp: thresholdBands.includes('temp'),
      rhObserved: false,
      rhExpected: thresholdBands.includes('rh_expected'),
      rhExpectedBaseline: false,
      moisture: thresholdBands.includes('moisture'),
      // Legacy/shared view mapping for components that only support one RH band.
      rh:
        thresholdBands.includes('rh_observed') ||
        thresholdBands.includes('rh') ||
        thresholdBands.includes('rh_expected'),
    }),
    [thresholdBands]
  );
  const moistureSeries = useMemo(() => {
    return aggregates.map((agg) => toAbsoluteHumidity(agg.temp_f_avg ?? null, agg.rh_avg ?? null));
  }, [aggregates, toAbsoluteHumidity]);
  const outdoorMoistureSeries = useMemo(() => {
    const rows = weatherData?.rows ?? [];
    if (!rows.length || !aggregates.length) return [];

    const toHourKey = (iso: string) => new Date(iso).toISOString().slice(0, 13);
    const weatherByHour = new Map<string, number | null>();

    for (const row of rows) {
      const hourKey = toHourKey(row.bucket_start);
      if (weatherByHour.has(hourKey)) continue;
      const tempC = row.temp_c_avg;
      const rh = row.rh_avg;
      if (typeof tempC !== 'number' || typeof rh !== 'number') {
        weatherByHour.set(hourKey, null);
        continue;
      }
      const tempF = tempC * (9 / 5) + 32;
      weatherByHour.set(hourKey, toAbsoluteHumidity(tempF, rh));
    }

    return aggregates.map((agg) => weatherByHour.get(toHourKey(agg.bucket_start)) ?? null);
  }, [aggregates, toAbsoluteHumidity, weatherData?.rows]);
  const openMeteoMoistureSeries = useMemo(() => {
    const rows = openMeteoData?.rows ?? [];
    if (!rows.length || !aggregates.length) return [];

    const toHourKey = (iso: string) => new Date(iso).toISOString().slice(0, 13);
    const weatherByHour = new Map<string, number | null>();
    for (const row of rows) {
      const hourKey = toHourKey(row.bucket_start);
      if (weatherByHour.has(hourKey)) continue;
      const tempC = row.temp_c_avg;
      const rh = row.rh_avg;
      if (typeof tempC !== 'number' || typeof rh !== 'number') {
        weatherByHour.set(hourKey, null);
        continue;
      }
      const tempF = tempC * (9 / 5) + 32;
      weatherByHour.set(hourKey, toAbsoluteHumidity(tempF, rh));
    }
    return aggregates.map((agg) => weatherByHour.get(toHourKey(agg.bucket_start)) ?? null);
  }, [aggregates, openMeteoData?.rows, toAbsoluteHumidity]);
  const moistureBaselineSeries = useMemo(() => {
    if (!aggregates.length || baselineByHour.tempSeries.length !== 24 || baselineByHour.rhSeries.length !== 24) {
      return [];
    }
    return aggregates.map((agg) => {
      const hour = new Date(agg.bucket_start).getHours();
      return toAbsoluteHumidity(
        baselineByHour.tempSeries[hour] ?? null,
        baselineByHour.rhSeries[hour] ?? null
      );
    });
  }, [aggregates, baselineByHour, toAbsoluteHumidity]);

  const moistureDeviationSeries = useMemo(() => {
    if (!normalizedDeviationView) return moistureSeries;
    return moistureSeries.map((v, i) => {
      const b = moistureBaselineSeries[i];
      if (typeof v !== 'number' || typeof b !== 'number' || b === 0) return null;
      return ((v - b) / b) * 100;
    });
  }, [moistureBaselineSeries, moistureSeries, normalizedDeviationView]);
  const outdoorMoistureDeviationSeries = useMemo(() => {
    if (!normalizedDeviationView) return outdoorMoistureSeries;
    return outdoorMoistureSeries.map((v, i) => {
      const b = moistureBaselineSeries[i];
      if (typeof v !== 'number' || typeof b !== 'number' || b === 0) return null;
      return ((v - b) / b) * 100;
    });
  }, [moistureBaselineSeries, normalizedDeviationView, outdoorMoistureSeries]);
  const openMeteoMoistureDeviationSeries = useMemo(() => {
    if (!normalizedDeviationView) return openMeteoMoistureSeries;
    return openMeteoMoistureSeries.map((v, i) => {
      const b = moistureBaselineSeries[i];
      if (typeof v !== 'number' || typeof b !== 'number' || b === 0) return null;
      return ((v - b) / b) * 100;
    });
  }, [moistureBaselineSeries, normalizedDeviationView, openMeteoMoistureSeries]);
  const observedRhSeries = useMemo(
    () => aggregates.map((agg) => (typeof agg.rh_avg === 'number' ? agg.rh_avg : null)),
    [aggregates]
  );
  const expectedRhSeries = useMemo(
    () => {
      const tempBaseline = repeatingBaselineOverlay[0]?.data ?? [];
      const rhBaseline = repeatingBaselineOverlay[1]?.data ?? [];
      return aggregates.map((agg, i) => {
        const tempValue = agg.temp_f_avg;
        const tempBase = tempBaseline[i] ?? null;
        const rhBase = rhBaseline[i] ?? null;
        if (typeof tempValue !== 'number' || typeof tempBase !== 'number' || typeof rhBase !== 'number' || tempBase === 0) {
          return null;
        }
        const tempDeviationRatio = (tempValue - tempBase) / tempBase;
        const expectedRh = rhBase * (1 - tempDeviationRatio);
        return Number.isFinite(expectedRh) ? expectedRh : null;
      });
    },
    [aggregates, repeatingBaselineOverlay]
  );
  const mainRhAlignment = useMemo(() => {
    const tempBaseline = repeatingBaselineOverlay[0]?.data ?? [];
    const rhBaseline = repeatingBaselineOverlay[1]?.data ?? [];
    const baselinePoint = tempBaseline.findIndex((t, i) => typeof t === 'number' && typeof rhBaseline[i] === 'number');
    const tempAnchor =
      baselinePoint >= 0
        ? (tempBaseline[baselinePoint] as number)
        : (tempBaseline.find((v): v is number => typeof v === 'number') ?? 0);
    const rhAnchor =
      baselinePoint >= 0
        ? (rhBaseline[baselinePoint] as number)
        : (rhBaseline.find((v): v is number => typeof v === 'number') ?? 0);
    const ratioSamples = tempBaseline
      .map((t, i) => {
        const r = rhBaseline[i];
        if (typeof t !== 'number' || typeof r !== 'number') return null;
        const tempBand = Math.abs(t) * thresholdPct;
        const rhBand = Math.abs(r) * thresholdPct;
        if (!Number.isFinite(tempBand) || !Number.isFinite(rhBand) || rhBand <= 0) return null;
        return tempBand / rhBand;
      })
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const scaleK = ratioSamples.length
      ? ratioSamples.reduce((sum, v) => sum + v, 0) / ratioSamples.length
      : 1;
    const offsetA = tempAnchor - scaleK * rhAnchor;
    const mapRhToTempScale = (rhValue: number | null) => {
      if (typeof rhValue !== 'number') return null;
      return offsetA + scaleK * rhValue;
    };
    const mappedRhBaseline = rhBaseline.map((rh) => mapRhToTempScale(rh));

    return {
      tempBaseline,
      rhBaseline,
      offsetA,
      scaleK,
      mappedRhBaseline,
    };
  }, [repeatingBaselineOverlay, thresholdPct]);

  const mainRhAlignedSeries = useMemo(() => {
    const observedRhRaw = observedRhSeries.map((v) => (typeof v === 'number' ? v : null));
    const expectedRhRaw = expectedRhSeries.map((v) => (typeof v === 'number' ? v : null));
    const observedRhRounded = observedRhRaw.map((v) => (typeof v === 'number' ? round(v) : null));
    const expectedRhRounded = expectedRhRaw.map((v) => (typeof v === 'number' ? round(v) : null));
    const rhBaseline = mainRhAlignment.rhBaseline.map((v) => (typeof v === 'number' ? round(v) : null));
    const transformRhSeries = (series: Array<number | null>) =>
      series.map((rh, i) => {
        if (!mirrorRhView) return rh;
        const baseline = rhBaseline[i];
        if (typeof rh !== 'number' || typeof baseline !== 'number') return null;
        return 2 * baseline - rh;
      });

    return {
      observedRhRaw,
      expectedRhRaw,
      observedRhAligned: transformRhSeries(observedRhRounded),
      expectedRhAligned: transformRhSeries(expectedRhRounded),
    };
  }, [expectedRhSeries, mainRhAlignment.rhBaseline, mirrorRhView, observedRhSeries, round]);

  const mainChartSeries = useMemo(
    () => {
      const tempSeries = getSeries('temp_f_avg');
      const { observedRhRaw, expectedRhRaw, observedRhAligned, expectedRhAligned } = mainRhAlignedSeries;
      const rhObservedSeries = normalizedDeviationView ? observedRhRaw : observedRhAligned;
      const rhExpectedSeries = normalizedDeviationView ? expectedRhRaw : expectedRhAligned;

      return [
        {
          name: 'Temperature (°F)',
          data: tempSeries
        },
        {
          name: 'Relative Humidity (%)',
          data: rhObservedSeries
        },
        {
          name: 'Expected RH (%)',
          data: rhExpectedSeries
        },
        {
          name: 'Moisture (g/m³)',
          data: moistureSeries.map((v) => (typeof v === 'number' ? round(v) : null))
        }
      ];
    },
    [getSeries, mainRhAlignedSeries, moistureSeries, normalizedDeviationView, round]
  );
  const mainChartTooltipOverrides = useMemo(
    () => [
      getSeries('temp_f_avg'),
      observedRhSeries.map((v) => (typeof v === 'number' ? round(v) : null)),
      expectedRhSeries.map((v) => (typeof v === 'number' ? round(v) : null)),
      moistureSeries.map((v) => (typeof v === 'number' ? round(v) : null)),
    ],
    [expectedRhSeries, getSeries, moistureSeries, observedRhSeries, round]
  );

  const mainChartOverlaySeries = useMemo(
    () => {
      const { tempBaseline, rhBaseline, mappedRhBaseline } = mainRhAlignment;
      const { expectedRhRaw, expectedRhAligned } = mainRhAlignedSeries;
      const rhExpectedBaselineForNormalized = expectedRhRaw;

      return [
        {
          name: 'Temperature Baseline (30d hour-of-day)',
          data: tempBaseline
        },
        {
          name: normalizedDeviationView
            ? 'Expected RH Baseline for Observed RH (%)'
            : 'RH Baseline (30d hour-of-day, %)',
          data: normalizedDeviationView ? rhExpectedBaselineForNormalized : rhBaseline
        },
        {
          name: 'Expected RH Baseline (%)',
          data: normalizedDeviationView ? rhExpectedBaselineForNormalized : rhBaseline
        },
        {
          name: 'Moisture Baseline (g/m³)',
          data: moistureBaselineSeries
        },
        {
          name: 'Expected RH Baseline (temp-aligned)',
          data: normalizedDeviationView ? expectedRhAligned : mappedRhBaseline
        }
      ];
    },
    [mainRhAlignedSeries, mainRhAlignment, moistureBaselineSeries, normalizedDeviationView]
  );

  const moistureThresholdBounds = useMemo(() => {
    if (normalizedDeviationView) {
      const band = thresholdPct * 100;
      return {
        upper: moistureDeviationSeries.map((v) => (typeof v === 'number' ? band : null)),
        lower: moistureDeviationSeries.map((v) => (typeof v === 'number' ? -band : null)),
      };
    }
    return {
      upper: moistureBaselineSeries.map((b) => (typeof b === 'number' ? b * (1 + thresholdPct) : null)),
      lower: moistureBaselineSeries.map((b) => (typeof b === 'number' ? b * (1 - thresholdPct) : null)),
    };
  }, [moistureBaselineSeries, moistureDeviationSeries, normalizedDeviationView, thresholdPct]);

  const moistureDisplayRange = useMemo(() => {
    const values = [
      ...moistureDeviationSeries,
      ...outdoorMoistureDeviationSeries,
      ...openMeteoMoistureDeviationSeries,
      ...moistureThresholdBounds.upper,
      ...moistureThresholdBounds.lower,
    ].filter((v): v is number => typeof v === 'number');
    if (!values.length) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min || 1) * 0.1;
    return { min: min - pad, max: max + pad };
  }, [moistureDeviationSeries, moistureThresholdBounds.lower, moistureThresholdBounds.upper, outdoorMoistureDeviationSeries, openMeteoMoistureDeviationSeries]);

  const mainChartMoistureRange = useMemo(() => {
    const seriesList = mainChartSeries.map((s) => s.data ?? []);
    const overlayList = (mainChartOverlaySeries ?? []).slice(0, mainChartSeries.length).map((s) => s.data ?? []);
    if (seriesList.length < 4) return null;

    const firstFinite = (values: Array<number | null>): number | null => {
      for (const v of values) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return null;
    };
    const seriesRange = (series: Array<number | null>, baseline: Array<number | null>) => {
      const upper = baseline.map((v) =>
        typeof v === 'number' ? (normalizedDeviationView ? thresholdPct * 100 : v * (1 + thresholdPct)) : null
      );
      const lower = baseline.map((v) =>
        typeof v === 'number' ? (normalizedDeviationView ? -thresholdPct * 100 : v * (1 - thresholdPct)) : null
      );
      const values = [...series, ...baseline, ...upper, ...lower].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v)
      );
      if (!values.length) return { min: 0, max: 1 };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const pad = (max - min || 1) * 0.1;
      return { min: min - pad, max: max + pad };
    };

    const ranges = seriesList.map((series, i) => seriesRange(series, overlayList[i] ?? []));

    if (normalizedDeviationView) {
      const maxAbs = Math.max(
        Math.abs(thresholdPct * 100),
        ...ranges.map((r) => Math.max(Math.abs(r.min), Math.abs(r.max)))
      );
      return { min: -maxAbs, max: maxAbs };
    }

    if (overlayList.length >= seriesList.length) {
      const spans = ranges.map((r) => Math.max(1, r.max - r.min));
      const centers = ranges.map((r, i) => firstFinite(overlayList[i] ?? []) ?? ((r.min + r.max) / 2));
      const bandMaxes = overlayList.map((baseline) => {
        const first = firstFinite(baseline);
        return typeof first === 'number' ? Math.abs(first) * thresholdPct : 0;
      });
      const validQs = bandMaxes
        .map((band, i) => (band > 0 ? band / spans[i] : null))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
      if (validQs.length) {
        const maxFeasibleQ = Math.min(...validQs);
        if (Number.isFinite(maxFeasibleQ) && maxFeasibleQ > 0) {
          const i = 3; // moisture metric index in main chart
          const band = bandMaxes[i] ?? 0;
          const span = spans[i] ?? 1;
          const targetSpan = band > 0 ? Math.max(span, band / maxFeasibleQ) : span;
          const center = centers[i] ?? ((ranges[i].min + ranges[i].max) / 2);
          return { min: center - targetSpan / 2, max: center + targetSpan / 2 };
        }
      }
    }

    return ranges[3] ?? null;
  }, [mainChartOverlaySeries, mainChartSeries, normalizedDeviationView, thresholdPct]);

  const moistureYAxisRange = useMemo(() => {
    const baseRange = mainChartMoistureRange ?? moistureDisplayRange;
    const baseSpan = baseRange.max - baseRange.min;
    if (!Number.isFinite(baseSpan) || baseSpan <= 0) return baseRange;

    const dataValues = [
      ...moistureDeviationSeries,
      ...outdoorMoistureDeviationSeries,
      ...openMeteoMoistureDeviationSeries,
      ...moistureThresholdBounds.upper,
      ...moistureThresholdBounds.lower,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (!dataValues.length) return baseRange;

    const dataMin = Math.min(...dataValues);
    const dataMax = Math.max(...dataValues);
    const dataSpan = Math.max(1e-9, dataMax - dataMin);

    // Target unit-per-pixel parity with main chart.
    const heightRatio = MOISTURE_CHART_HEIGHT / MAIN_TIME_SERIES_HEIGHT;
    const targetSpan = baseSpan * heightRatio;

    // If data exceeds target span, widen minimally to keep all points visible.
    const span = Math.max(targetSpan, dataSpan * 1.05);

    // Start from base center, then shift window only as needed to include all data.
    let min = ((baseRange.min + baseRange.max) / 2) - span / 2;
    let max = min + span;

    if (dataMin < min) {
      min = dataMin;
      max = min + span;
    }
    if (dataMax > max) {
      max = dataMax;
      min = max - span;
    }

    return { min, max };
  }, [
    mainChartMoistureRange,
    moistureDisplayRange,
    moistureDeviationSeries,
    outdoorMoistureDeviationSeries,
    openMeteoMoistureDeviationSeries,
    moistureThresholdBounds.upper,
    moistureThresholdBounds.lower,
  ]);

  const moistureChartOptions = useMemo<ApexOptions>(() => ({
    chart: {
      animations: { enabled: false },
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    colors: [theme.palette.info.main, theme.palette.text.secondary, theme.palette.success.main],
    dataLabels: { enabled: false },
    fill: { opacity: 1, type: 'solid' },
    grid: {
      borderColor: theme.palette.divider,
      strokeDashArray: 2,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: { show: true, horizontalAlign: 'right' },
    markers: { size: 0 },
    stroke: { curve: 'smooth', width: [3, 2, 2], dashArray: [0, 6, 4] },
    theme: { mode: theme.palette.mode },
    tooltip: { shared: true },
    xaxis: {
      categories: xAxisLabels.length ? xAxisLabels : tooltipCategories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { show: true, rotate: 0, hideOverlappingLabels: true },
    },
    yaxis: [{
      min: moistureYAxisRange.min,
      max: moistureYAxisRange.max,
      labels: { show: false },
      forceNiceScale: true,
    }]
  }), [moistureYAxisRange.max, moistureYAxisRange.min, theme, tooltipCategories, xAxisLabels]);

  const moistureEnvelopePath = useMemo(() => {
    if (!moisturePlotBounds) return null;
    return buildEnvelopePath(
      moistureThresholdBounds.upper,
      moistureThresholdBounds.lower,
      moisturePlotBounds,
      moistureYAxisRange.min,
      moistureYAxisRange.max
    );
  }, [moisturePlotBounds, moistureThresholdBounds.lower, moistureThresholdBounds.upper, moistureYAxisRange.max, moistureYAxisRange.min]);

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !globalThis.window) return;
    const fire = () => globalThis.window.dispatchEvent(new Event('resize'));
    const rafId = globalThis.window.requestAnimationFrame(fire);
    const timeoutId = globalThis.window.setTimeout(fire, 220);
    return () => {
      globalThis.window.cancelAnimationFrame(rafId);
      globalThis.window.clearTimeout(timeoutId);
    };
  }, [selectedOverviewAlert]);

  useEffect(() => {
    const measure = () => {
      const frame = moistureChartFrameRef.current;
      if (!frame) return;
      const rootRect = frame.getBoundingClientRect();
      const gridEl = frame.querySelector('.apexcharts-grid') || frame.querySelector('.apexcharts-inner');
      if (!gridEl || !(gridEl instanceof Element)) {
        setMoisturePlotBounds(null);
        return;
      }
      const gridRect = gridEl.getBoundingClientRect();
      if (!gridRect.width || !gridRect.height) {
        setMoisturePlotBounds(null);
        return;
      }
      setMoisturePlotBounds({
        left: gridRect.left - rootRect.left,
        top: gridRect.top - rootRect.top,
        width: gridRect.width,
        height: gridRect.height,
        frameWidth: rootRect.width,
        frameHeight: rootRect.height,
      });
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof globalThis !== 'undefined' && globalThis.window) {
      const t1 = globalThis.window.setTimeout(measure, 120);
      const t2 = globalThis.window.setTimeout(measure, 260);
      globalThis.window.addEventListener('resize', measure);
      if (typeof ResizeObserver !== 'undefined' && moistureChartFrameRef.current) {
        ro = new ResizeObserver(() => measure());
        ro.observe(moistureChartFrameRef.current);
      }
      return () => {
        globalThis.window.clearTimeout(t1);
        globalThis.window.clearTimeout(t2);
        globalThis.window.removeEventListener('resize', measure);
        ro?.disconnect();
      };
    }
    return;
  }, [normalizedDeviationView, thresholdPct, xAxisLabels, tooltipCategories, moistureDeviationSeries]);

  const handleOverviewAlertDrawerClose = useCallback(() => {
    setSelectedOverviewAlert(null);
    const nextQuery = { ...router.query };
    delete nextQuery.alertId;
    delete nextQuery.category;
    delete nextQuery.status;

    router.push(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router]);

  const handleOverviewAlertSave = useCallback((_alertId: string, _updates: Partial<Alert>) => {
    // Event alerts are derived from aggregate data and threshold settings; edits are not persisted.
  }, []);



  return (
    <>
      <Head>
        <title>
          Dashboard: Overview | Devias Kit PRO
        </title>
      </Head>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: 8
        }}
      >
        <Container maxWidth={settings.stretch ? false : 'xl'}>
          <Box
            ref={rootRef}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              width: '100%',
              minWidth: 0
            }}
          >
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Grid
            container
            spacing={{
              xs: 3,
              lg: 4
            }}
          >
            <Grid xs={12}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                spacing={2}
              >
                <Stack 
                  spacing={2} 
                  direction={"row"}
                  alignItems="flex-end"
                  sx={{ mb: 1 }}
                >
                  <Typography variant="h4" 
                    sx={{ lineHeight: 1 }}>
                    Overview
                  </Typography>
                  <Chip
                    label={`${format(from, 'MMM d, HH:mm')} - ${format(to, 'MMM d, HH:mm')} (${bucketLabel})`}
                    size="small"
                    sx={{ width: 'fit-content', p: 1, display: "none" }}
                    variant="filled"
                  />
                </Stack>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                >
                  <TimeContextControls />
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={normalizedDeviationView}
                        onChange={(_, checked) => setNormalizedDeviationView(checked)}
                        size="small"
                      />
                    )}
                    label="Normalized deviation"
                  />
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={mirrorRhView}
                        onChange={(_, checked) => setMirrorRhView(checked)}
                        size="small"
                      />
                    )}
                    label="Mirror RH"
                  />
                  <FormControl
                    size="small"
                    sx={{ minWidth: 130 }}
                  >
                    <InputLabel id="overview-threshold-label">Threshold</InputLabel>
                    <Select
                      label="Threshold"
                      labelId="overview-threshold-label"
                      value={String(thresholdPct)}
                      onChange={(event) => setThresholdPct(Number(event.target.value) as ThresholdPreset)}
                    >
                      {THRESHOLD_PRESETS.map((preset) => (
                        <MenuItem
                          key={preset}
                          value={String(preset)}
                        >
                          ±{Math.round(preset * 100)}%
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl
                    size="small"
                    sx={{ minWidth: 180 }}
                  >
                    <InputLabel id="overview-threshold-bands-label">Bands</InputLabel>
                    <Select
                      multiple
                      input={<OutlinedInput label="Bands" />}
                      labelId="overview-threshold-bands-label"
                      renderValue={(selected) =>
                        (selected as string[])
                          .map((key) => THRESHOLD_BAND_OPTIONS.find((o) => o.key === key)?.label ?? key)
                          .join(', ')
                      }
                      value={thresholdBands}
                      onChange={(event) => {
                        const allowed = new Set(THRESHOLD_BAND_OPTIONS.map((option) => option.key));
                        const next = (event.target.value as ThresholdBandKey[]).filter(
                          (key) => key !== 'rh' && allowed.has(key)
                        );
                        setThresholdBands(next);
                      }}
                    >
                      {THRESHOLD_BAND_OPTIONS.map((option) => (
                        <MenuItem key={option.key} value={option.key}>
                          <Checkbox checked={thresholdBands.includes(option.key)} />
                          <ListItemText primary={option.label} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
            </Grid>
            <Grid
              xs={12}
              md={8}
            >
              <Stack
                direction="row"
                spacing={3}
                sx={{ mb: 3 }}
              >
                <MetricCard
                  chartColor={theme.palette.primary.main}
                  mainAmount={`${currentTempMean.toFixed(1)}°`}
                  mainLabel="F"
                  rate={tempRate}
                  sx={{ flexBasis: '50%' }}
                  min={`${currentTempMin.toFixed(1)}°`}
                  max={`${currentTempMax.toFixed(1)}°`}
                />
                <MetricCard
                  chartColor={theme.palette.info.main}
                  mainAmount={`${currentRhMean.toFixed(1)}%`}
                  mainLabel="RH"
                  rate={rhRate}
                  sx={{ flexBasis: '50%' }}
                  min={`${currentRhMin.toFixed(1)}%`}
                  max={`${currentRhMax.toFixed(1)}%`}
                />
              </Stack>
              <Card>
                <CardContent>
                  <TimeSeriesChart
                    chartSeries={mainChartSeries}
                    overlaySeries={mainChartOverlaySeries}
                    showOverlayLines={false}
                    equalizeThresholdBands
                    normalizeDeviation={normalizedDeviationView}
                    tooltipCategories={tooltipCategories}
                    xAxisLabels={xAxisLabels}
                    pointTimestamps={bucketStarts}
                    highlightRange={mainChartHighlightRange}
                    thresholds={undefined}
                    layoutSignal={selectedOverviewAlert ? 'drawer-open' : 'drawer-closed'}
                    tooltipValueOverrides={mainChartTooltipOverrides}
                    thresholdBandCenterSeries={{
                      rhExpected: 2,
                    }}
                    thresholdBandVisibility={{
                      temp: thresholdBandVisibility.temp,
                      rhObserved: false,
                      rhExpected: thresholdBandVisibility.rhExpected,
                      rhExpectedBaseline: false,
                      moisture: thresholdBandVisibility.moisture,
                    }}
                  />
                </CardContent>
              </Card>
              <Card sx={{ mt: 3 }}>
                <CardHeader
                  title="Absolute Moisture"
                  subheader="Indoor vs outdoor absolute humidity (g/m³)"
                />
                <CardContent>
                  <Box ref={moistureChartFrameRef} sx={{ position: 'relative' }}>
                    <Chart
                      type="line"
                      height={MOISTURE_CHART_HEIGHT}
                      options={moistureChartOptions}
                      series={[
                        {
                          name: normalizedDeviationView ? 'Indoor Moisture Deviation (%)' : 'Indoor Moisture (g/m³)',
                          data: moistureDeviationSeries
                        },
                        {
                          name: normalizedDeviationView ? 'Outdoor Moisture Deviation (%)' : 'Outdoor Moisture (g/m³)',
                          data: outdoorMoistureDeviationSeries
                        },
                        {
                          name: normalizedDeviationView ? 'Open-Meteo Moisture Deviation (%)' : 'Open-Meteo Moisture (g/m³)',
                          data: openMeteoMoistureDeviationSeries
                        },
                      ]}
                    />
                    {moisturePlotBounds && moistureEnvelopePath && (
                      <Box
                        component="svg"
                        viewBox={`0 0 ${moisturePlotBounds.frameWidth} ${moisturePlotBounds.frameHeight}`}
                        sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                      >
                        <path d={moistureEnvelopePath} fill={theme.palette.info.main} fillOpacity={0.12} />
                      </Box>
                    )}
                    {moistureMaskPercents && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'none'
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            top: moisturePlotBounds?.top ?? 44,
                            height: moisturePlotBounds?.height ?? 'auto',
                            left: moisturePlotBounds?.left ?? 0,
                            width: moisturePlotBounds
                              ? `${(moistureMaskPercents.leftPct / 100) * moisturePlotBounds.width}px`
                              : `${moistureMaskPercents.leftPct}%`,
                            backgroundColor: alpha('#ffffff', 0.8)
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            top: moisturePlotBounds?.top ?? 44,
                            height: moisturePlotBounds?.height ?? 'auto',
                            left: moisturePlotBounds
                              ? moisturePlotBounds.left + moisturePlotBounds.width - (moistureMaskPercents.rightPct / 100) * moisturePlotBounds.width
                              : undefined,
                            right: moisturePlotBounds ? undefined : 0,
                            width: moisturePlotBounds
                              ? `${(moistureMaskPercents.rightPct / 100) * moisturePlotBounds.width}px`
                              : `${moistureMaskPercents.rightPct}%`,
                            backgroundColor: alpha('#ffffff', 0.8)
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
              <Card sx={{ mt: 3 }}>
                <CardHeader
                  title="30-Day Hour-of-Day Baseline"
                  subheader="Average curve by hour-of-day (same hour over trailing 30 days, 1h buckets)"
                />
                <CardContent>
                  <TimeSeriesChart
                    chartSeries={baselineChartSeries}
                    overlaySeries={baselineChartSeries}
                    showOverlayLines={false}
                    equalizeThresholdBands
                    normalizeDeviation={normalizedDeviationView}
                    tooltipCategories={baselineTrailingCategories}
                    xAxisLabels={baselineChartXAxisLabels}
                    thresholdBandCenterSeries={{
                      temp: 0,
                      rhExpected: 2,
                      moisture: 3,
                    }}
                    thresholdBandVisibility={{
                      temp: thresholdBandVisibility.temp,
                      rhObserved: false,
                      rhExpected: thresholdBandVisibility.rhExpected,
                      rhExpectedBaseline: false,
                      moisture: thresholdBandVisibility.moisture,
                    }}
                  />
                </CardContent>
              </Card>
          <Stack 
            direction={"row"} 
            gap={3}
            sx={{ my: 1 }}>
            
            <Grid
              xs={12}
              md={4}
              sx={{ px: 0 }}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See campaigns
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.completenessSeries
                  }
                ]}
                title="Data Completeness"
                value={`${analyticsMetrics.completenessValue}%`}
              />
              
            </Grid>
            <Grid
              xs={12}
              md={4}
              sx={{ px: 0 }}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See sources
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.withinThresholdSeries
                  }
                ]}
                title="% Time within Thresholds"
                value={`${analyticsMetrics.withinThresholdPct}%`}
              />
            </Grid>
            <Grid
              xs={12}
              md={4}
              sx={{ px: 0 }}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See campaigns
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.breachSeries
                  }
                ]}
                title="Threshold Breaches"
                value={`${analyticsMetrics.breachTotal}`}
              />
              
            </Grid>
            </Stack>
            </Grid>
            <Grid 
              xs={12} 
              lg={4}
              sx={{
                pb: { lg: 0 },
              }}>
              <Box
                sx={{
                  position: { xs: 'static', lg: 'sticky' },
                  top: { lg: 80 },
                  alignSelf: 'flex-start',
                  maxHeight: { xs: 'none', lg: 'calc(100vh - 40px)' },
                  overflowY: { xs: 'visible', lg: 'auto' },
                  pr: { lg: 1 },
                  pb: { lg: 8 }
                }}
              >
                <AlertsTable
                  showDrawer={false}
                  onSelectedAlertChange={setSelectedOverviewAlert}
                  onHoveredAlertChange={setHoveredOverviewAlert}
                  preloadedAggregates={baselineAggregates}
                />
              </Box>
            </Grid>
          

          </Grid>
          </Box>
          <AlertDetailsDrawer
            alert={selectedOverviewAlert}
            container={rootRef.current}
            desktopInitialOffsetTop={88}
            normalizeDeviation={normalizedDeviationView}
            thresholdBandVisibility={thresholdBandVisibility}
            onClose={handleOverviewAlertDrawerClose}
            onSave={handleOverviewAlertSave}
            open={Boolean(selectedOverviewAlert)}
          />
          </Box>
          
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) => (
  <DashboardLayout>
    {page}
  </DashboardLayout>
);

export default Page;
