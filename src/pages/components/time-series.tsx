/* eslint-disable react/jsx-max-props-per-line */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import type { ApexOptions } from 'apexcharts';
import { format, subDays } from 'date-fns';
import { Box, Card, CardContent, CardHeader } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Chart } from '@/components/chart';
import { formatTimeWindowLabel, useTimeContext } from '@/contexts/time-context';

const now = new Date();

const createCategories = (): string[] => {
  const categories: string[] = [];

  for (let i = 12; i >= 0; i--) {
    categories.push(format(subDays(now, i), 'dd MMM'));
  }

  return categories;
};

// added this helper to calculate min/max for y-axis based on data, with some padding
const getSeriesRange = (...seriesList: Array<(number | null)[]>) => {
  const data = seriesList.flat();
  const values = data.filter((v): v is number => typeof v === 'number');
  if (!values.length) return { min: 0, max: 1 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.2; // 20% padding to avoid clipping short-window peaks

  return {
    min: min - pad,
    max: max + pad,
  };
};

type AxisRange = { min: number; max: number };

const equalizeAxisRanges = (ranges: AxisRange[]): AxisRange[] => {
  const spans = ranges.map((r) => Math.max(1, r.max - r.min));
  const commonSpan = Math.max(...spans);
  return ranges.map((r) => {
    const center = (r.min + r.max) / 2;
    return {
      min: center - commonSpan / 2,
      max: center + commonSpan / 2,
    };
  });
};

const equalizeNormalizedRanges = (
  ranges: AxisRange[],
  thresholdPct: number
): AxisRange[] => {
  // In normalized mode, all metrics are deviation percentages.
  // Keep every axis centered at 0 with the same +/- span so threshold bands align.
  const thresholdBand = Math.abs(thresholdPct * 100);
  const maxAbs = Math.max(
    thresholdBand,
    ...ranges.map((r) => Math.max(Math.abs(r.min), Math.abs(r.max), 1))
  );
  return ranges.map(() => ({ min: -maxAbs, max: maxAbs }));
};

const equalizeRawRangesByThresholdBandMulti = (
  ranges: AxisRange[],
  baselinesByMetric: Array<Array<number | null>>,
  thresholdPct: number
): AxisRange[] => {
  const spans = ranges.map((r) => Math.max(1, r.max - r.min));
  const firstFinite = (values: Array<number | null>): number | null => {
    for (const v of values) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  };
  const baselineCenters = baselinesByMetric.map((baseline) => firstFinite(baseline));
  const centers = ranges.map((r, i) => baselineCenters[i] ?? ((r.min + r.max) / 2));
  const bandMaxes = baselinesByMetric.map((baseline) => {
    const first = firstFinite(baseline);
    return typeof first === 'number' ? Math.abs(first) * thresholdPct : 0;
  });

  const validQs = bandMaxes
    .map((band, i) => (band > 0 ? band / spans[i] : null))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

  if (!validQs.length) {
    return equalizeAxisRanges(ranges);
  }

  const maxFeasibleQ = Math.min(...validQs);
  if (!Number.isFinite(maxFeasibleQ) || maxFeasibleQ <= 0) {
    return equalizeAxisRanges(ranges);
  }

  return ranges.map((r, i) => {
    const band = bandMaxes[i];
    const span = spans[i];
    const targetSpan = band > 0 ? Math.max(span, band / maxFeasibleQ) : span;
    return {
      min: centers[i] - targetSpan / 2,
      max: centers[i] + targetSpan / 2,
    };
  });
};

const buildEnvelopePath = (
  upper: Array<number | null>,
  lower: Array<number | null>,
  plot: { left: number; top: number; width: number; height: number },
  yMin: number,
  yMax: number
) => {
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
  const span = yMax - yMin || 1;
  const n = Math.min(upper.length, lower.length);
  if (n < 2 || !plot.width || !plot.height) return null;

  const upperPts: string[] = [];
  const lowerPts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const hi = upper[i];
    const lo = lower[i];
    if (typeof hi !== 'number' || typeof lo !== 'number') {
      return null;
    }
    const x = plot.left + (i / (n - 1)) * plot.width;
    const yHi = plot.top + (1 - (hi - yMin) / span) * plot.height;
    const yLo = plot.top + (1 - (lo - yMin) / span) * plot.height;
    upperPts.push(`${x},${yHi}`);
    lowerPts.push(`${x},${yLo}`);
  }

  return `M ${upperPts.join(' L ')} L ${lowerPts.reverse().join(' L ')} Z`;
};




const useChartOptions = (
  metricRanges: AxisRange[],
  tooltipCategories?: string[],
  xAxisLabels?: string[],
  overlaySeriesCount?: number,
  seriesNames?: string[],
  axisGroupBySeries?: number[],
  thresholds?: { temp?: number | null; rh?: number | null; moisture?: number | null },
  normalizeDeviation?: boolean,
  tooltipValueOverrides?: Array<Array<number | null>>,
  forceStraightLines?: boolean,
  showLegend?: boolean,
  showXAxisLabels?: boolean,
): ApexOptions => {
  const theme = useTheme();
  if (!tooltipCategories) tooltipCategories = createCategories();
  const axisCategories = xAxisLabels && xAxisLabels.length ? xAxisLabels : tooltipCategories;

  return useMemo(() => ({
    chart: {
      background: 'transparent',
      stacked: false,
      animations: {
        enabled: false,
      },
      toolbar: {
        show: false
      },
      zoom: {
        enabled: false
      }
    },
    colors: (() => {
      const names = seriesNames ?? [];
      const isNonOverlayMainRhExpectedView = !overlaySeriesCount && names.some((name) => name.includes('Expected RH'));
      const nonOverlayColors = isNonOverlayMainRhExpectedView
        ? names.map((name) => {
            if (name.includes('Temperature')) return theme.palette.primary.main;
            if (name === 'RH Baseline (%)' || name === 'Expected RH Baseline (%)') return theme.palette.warning.main;
            if (name.includes('Expected RH Baseline')) return theme.palette.info.main;
            if (name.includes('Expected RH')) return theme.palette.warning.main;
            if (name.includes('Observed RH') || name.includes('Relative Humidity')) return theme.palette.warning.main;
            if (name.includes('Moisture')) return theme.palette.info.main;
            return theme.palette.info.main;
          })
        : [
            theme.palette.primary.main,
            theme.palette.warning.main,
            theme.palette.success.main,
            alpha(theme.palette.warning.main, 0.55),
          ];
      return overlaySeriesCount === 3
      ? [
          theme.palette.primary.main,
          alpha(theme.palette.primary.main, 0.55),
          theme.palette.warning.main,
          alpha(theme.palette.warning.main, 0.55),
          theme.palette.success.main,
          alpha(theme.palette.success.main, 0.55),
        ]
      : overlaySeriesCount === 2
        ? [
            theme.palette.primary.main,
            alpha(theme.palette.primary.main, 0.55),
            theme.palette.warning.main,
            alpha(theme.palette.warning.main, 0.55),
          ]
        : [
            ...nonOverlayColors,
          ];
    })(),
    dataLabels: {
      enabled: false
    },
    fill: {
      opacity: 1,
      type: 'solid'
    },
    grid: {
      borderColor: theme.palette.divider,
      strokeDashArray: 2,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    legend: {
      horizontalAlign: 'right',
      labels: {
        colors: theme.palette.text.secondary
      },
      position: 'top',
      show: showLegend ?? true
    },
    markers: {
      hover: {
        size: undefined,
        sizeOffset: 2
      },
      radius: 2,
      shape: 'circle',
      size: 1,
      strokeWidth: 0
    },
    stroke: (() => {
      const names = seriesNames ?? [];
      const isNonOverlayMainRhExpectedView = !overlaySeriesCount && names.some((name) => name.includes('Expected RH'));
      const nonOverlayDash = isNonOverlayMainRhExpectedView
        ? names.map((name) => {
            if (name.includes('Expected RH Baseline')) return 4;
            if (name.includes('Expected RH')) return 8;
            return 0;
          })
        : [0, 3, 0, 3];
      const nonOverlayWidth = isNonOverlayMainRhExpectedView
        ? names.map((name) => {
            if (name.includes('Expected RH Baseline')) return 1.5;
            if (name.includes('Expected RH')) return 2;
            return 3;
          })
        : 3;
      return {
        curve: normalizeDeviation || forceStraightLines ? 'straight' : 'smooth',
        dashArray: overlaySeriesCount === 3 ? [0, 8, 3, 8, 0, 8] : overlaySeriesCount === 2 ? [0, 8, 3, 8] : nonOverlayDash,
        lineCap: 'butt',
        width: overlaySeriesCount === 3 ? [3, 2, 3, 2, 3, 2] : overlaySeriesCount === 2 ? [3, 2, 3, 2] : nonOverlayWidth
      };
    })(),
    theme: {
      mode: theme.palette.mode
    },
    tooltip: {
      x: {
        formatter: (value: number, opts?: { dataPointIndex?: number }) => {
          const i = opts?.dataPointIndex;
          if (
            typeof i === 'number' &&
            tooltipCategories &&
            i >= 0 &&
            i < tooltipCategories.length
          ) {
            return tooltipCategories[i];
          }
          return String(value);
        }
      },
      y: {
        formatter: (value: number, opts?: { seriesIndex?: number; dataPointIndex?: number }) => {
          if (!Number.isFinite(value)) return String(value);
          const overrideValue = (
            typeof opts?.seriesIndex === 'number' &&
            typeof opts?.dataPointIndex === 'number' &&
            tooltipValueOverrides &&
            tooltipValueOverrides[opts.seriesIndex] &&
            typeof tooltipValueOverrides[opts.seriesIndex][opts.dataPointIndex] === 'number'
          )
            ? (tooltipValueOverrides[opts.seriesIndex][opts.dataPointIndex] as number)
            : null;
          const seriesName =
            typeof opts?.seriesIndex === 'number'
              ? (seriesNames?.[opts.seriesIndex] ?? '')
              : '';
          const displayValue = !normalizeDeviation && typeof overrideValue === 'number'
            ? overrideValue
            : value;
          const rounded = displayValue.toFixed(1);

          if (normalizeDeviation) return `${rounded}%`;
          if (seriesName.includes('Temperature')) return `${rounded} °F`;
          if (seriesName.includes('Moisture')) return `${rounded} g/m³`;
          if (seriesName.includes('RH')) return `${rounded}%`;
          return rounded;
        }
      }
    },
    xaxis: {
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      categories: axisCategories,
      labels: {
        show: showXAxisLabels ?? true,
        rotate: 0,
        hideOverlappingLabels: true,
      }
    },
    yaxis: (seriesNames ?? []).map((name, seriesIndex) => {
      const metricCount = overlaySeriesCount && overlaySeriesCount > 0
        ? overlaySeriesCount
        : metricRanges.length;
      const metricIndex = overlaySeriesCount && overlaySeriesCount > 0
        ? Math.floor(seriesIndex / 2)
        : (axisGroupBySeries?.[seriesIndex] ?? seriesIndex);
      const range = metricRanges[metricIndex] ?? metricRanges[0] ?? { min: 0, max: 1 };
      const isOverlayLine = Boolean(overlaySeriesCount && seriesIndex % 2 === 1);
      return {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { show: false },
        min: range.min,
        max: range.max,
        forceNiceScale: false,
        opposite: metricIndex > 0,
        show: !isOverlayLine,
        seriesName: name,
      };
    }),
    annotations: {
      yaxis: [
        ...(thresholds?.temp != null
          ? [{
              y: thresholds.temp,
              yAxisIndex: 0,
              borderColor: theme.palette.primary.main,
              borderWidth: 2,
              opacity: 0.9,
              strokeDashArray: 4
            }]
          : []),
        ...(thresholds?.rh != null
          ? [{
              y: thresholds.rh,
              yAxisIndex: overlaySeriesCount && overlaySeriesCount > 0 ? 2 : 1,
              borderColor: theme.palette.warning.main,
              borderWidth: 2,
              opacity: 0.9,
              strokeDashArray: 4
            }]
          : []),
        ...(thresholds?.moisture != null
          ? [{
              y: thresholds.moisture,
              yAxisIndex: overlaySeriesCount && overlaySeriesCount > 0 ? 4 : 2,
              borderColor: theme.palette.success.main,
              borderWidth: 2,
              opacity: 0.9,
              strokeDashArray: 4
            }]
          : [])
      ],
      xaxis: [],
      points: [],
      texts: [],
      images: []
    }
  }), [
    axisCategories,
    metricRanges,
    overlaySeriesCount,
    seriesNames,
    axisGroupBySeries,
    theme,
    thresholds?.moisture,
    thresholds?.temp,
    thresholds?.rh,
    tooltipCategories,
    normalizeDeviation,
    tooltipValueOverrides,
    forceStraightLines,
    showLegend,
    showXAxisLabels
  ]);
};

type ChartSeries = {
  name: string;
  data: (number | null)[];
}[];

interface TimeSeriesChartProps {
  chartSeries: ChartSeries;
  title?: string & ReactNode;
  tooltipCategories?: string[];
  xAxisLabels?: string[];
  overlaySeries?: ChartSeries;
  pointTimestamps?: string[];
  highlightRange?: { startMs: number; endMs: number } | null;
  thresholds?: { temp?: number | null; rh?: number | null; moisture?: number | null };
  layoutSignal?: string | number;
  normalizeDeviation?: boolean;
  showOverlayLines?: boolean;
  thresholdBandVisibility?: {
    temp: boolean;
    moisture: boolean;
    rhObserved?: boolean;
    rhExpected?: boolean;
    rhExpectedBaseline?: boolean;
    // Backward-compat aliases
    rh?: boolean;
  };
  tooltipValueOverrides?: Array<Array<number | null>>;
  equalizeThresholdBands?: boolean;
  thresholdBandCenterSeries?: {
    temp?: number;
    moisture?: number;
    rhObserved?: number;
    rhExpected?: number;
    rhExpectedBaseline?: number;
    // Backward-compat alias
    rh?: number;
  };
  disableAutoAxisGrouping?: boolean;
  showLegend?: boolean;
  showXAxisLabels?: boolean;
  chartHeight?: number;
}

const TimeSeriesChartComponent = (props: TimeSeriesChartProps) => {
  const {
    chartSeries,
    tooltipCategories,
    xAxisLabels,
    overlaySeries,
    pointTimestamps,
    highlightRange,
    thresholds,
    layoutSignal,
    normalizeDeviation = false,
    showOverlayLines = true,
    thresholdBandVisibility = { temp: true, moisture: true, rhObserved: true, rhExpected: false, rhExpectedBaseline: false },
    tooltipValueOverrides,
    equalizeThresholdBands = true,
    thresholdBandCenterSeries,
    disableAutoAxisGrouping = false,
    showLegend = true,
    showXAxisLabels = true,
    chartHeight = 320,
  } = props;
  const { window: timeWindow, thresholdPct } = useTimeContext();
  const theme = useTheme();
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [plotBounds, setPlotBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);

  const title = props.title || formatTimeWindowLabel(timeWindow);

  const toDeviationPercent = (value: number | null, baseline: number | null): number | null => {
    if (typeof value !== 'number' || typeof baseline !== 'number' || baseline === 0) return null;
    return ((value - baseline) / baseline) * 100;
  };

  const normalizedSeries = useMemo(() => {
    if (!normalizeDeviation) {
      return {
        chartSeries,
        overlaySeries,
      };
    }

    if (overlaySeries && overlaySeries.length >= 2) {
      const normalizedChart = chartSeries.map((series, i) => ({
        ...(series ?? { name: `Series ${i + 1}`, data: [] }),
        data: (series?.data ?? []).map((v, j) =>
          toDeviationPercent(v, overlaySeries[i]?.data?.[j] as number | null)
        )
      }));
      const normalizedOverlay = overlaySeries.map((series, i) => ({
        ...(series ?? { name: `Baseline ${i + 1}`, data: [] }),
        data: (overlaySeries[i]?.data ?? []).map((b) => (typeof b === 'number' ? 0 : null))
      }));

      return {
        chartSeries: normalizedChart,
        overlaySeries: normalizedOverlay
      };
    }

    // No external baseline: normalize each series to its own mean.
    const normalizeToMean = (series: Array<number | null>) => {
      const nums = series.filter((v): v is number => typeof v === 'number');
      const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      return series.map((v) => toDeviationPercent(v, mean));
    };

    return {
      chartSeries: chartSeries.map((series, i) => ({
        ...(series ?? { name: `Series ${i + 1}`, data: [] }),
        data: normalizeToMean(series?.data ?? []),
      })),
      overlaySeries: undefined
    };
  }, [chartSeries, normalizeDeviation, overlaySeries]);

  const activeChartSeries = normalizedSeries.chartSeries;
  const activeOverlaySeries = normalizedSeries.overlaySeries;

  const metricRanges = useMemo(
    () => activeChartSeries.map((series, i) => {
      const base = activeOverlaySeries?.[i]?.data ?? [];
      if (!base.length) {
        return getSeriesRange(series?.data ?? []);
      }

      const upper = normalizeDeviation
        ? base.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
        : base.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
      const lower = normalizeDeviation
        ? base.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
        : base.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));

      return getSeriesRange(series?.data ?? [], base, upper, lower);
    }),
    [activeChartSeries, activeOverlaySeries, normalizeDeviation, thresholdPct]
  );
  const comparableRanges = useMemo(() => {
    if (normalizeDeviation) {
      return equalizeNormalizedRanges(metricRanges, thresholdPct);
    }
    if (!normalizeDeviation && activeOverlaySeries && activeOverlaySeries.length >= activeChartSeries.length && equalizeThresholdBands) {
      return equalizeRawRangesByThresholdBandMulti(
        metricRanges,
        activeOverlaySeries.slice(0, activeChartSeries.length).map((s) => s?.data ?? []),
        thresholdPct
      );
    }
    return metricRanges;
  }, [activeChartSeries.length, activeOverlaySeries, equalizeThresholdBands, metricRanges, normalizeDeviation, thresholdPct]);
  const highlightActive = Boolean(
    highlightRange &&
    pointTimestamps &&
    pointTimestamps.length === (activeChartSeries[0]?.data?.length ?? 0)
  );

  const combinedSeries: ChartSeries = useMemo(
    () => {
      const fallbackSeries: ChartSeries = activeChartSeries.map((series, i) => (
        series ?? { name: `Series ${i + 1}`, data: [] }
      ));

      const metricCount = activeChartSeries.length;
      if (!overlaySeries || overlaySeries.length < metricCount || !showOverlayLines) {
        return fallbackSeries.slice(0, metricCount);
      }

      if (!activeOverlaySeries || activeOverlaySeries.length < metricCount) {
        return fallbackSeries.slice(0, metricCount);
      }

      const interleaved: ChartSeries = [];
      for (let i = 0; i < metricCount; i += 1) {
        interleaved.push(fallbackSeries[i]);
        interleaved.push(activeOverlaySeries[i] ?? { name: `Baseline ${i + 1}`, data: [] });
      }
      return interleaved;
    },
    [activeChartSeries, activeOverlaySeries, overlaySeries, showOverlayLines]
  );

  const seriesNames = useMemo(
    () => combinedSeries.map((s) => s.name),
    [combinedSeries]
  );
  const overlayMetricCount = useMemo(
    () => (
      showOverlayLines &&
      overlaySeries &&
      activeOverlaySeries &&
      activeOverlaySeries.length >= activeChartSeries.length
        ? activeChartSeries.length
        : 0
    ),
    [activeChartSeries.length, activeOverlaySeries, overlaySeries, showOverlayLines]
  );
  const axisGroupBySeries = useMemo<number[] | undefined>(() => {
    if (disableAutoAxisGrouping) {
      return undefined;
    }
    if (overlayMetricCount > 0) {
      return undefined;
    }
    const observedIdx = seriesNames.findIndex(
      (name) => name.includes('Observed RH') || name.includes('Relative Humidity')
    );
    const expectedIdx = seriesNames.findIndex((name) => name.includes('Expected RH'));
    const expectedBaselineIdx = seriesNames.findIndex((name) => name.includes('Expected RH Baseline'));
    const rhBaselineIdx = seriesNames.findIndex((name) => name === 'RH Baseline (%)');
    const expectedRhBaselineIdx = seriesNames.findIndex((name) => name === 'Expected RH Baseline (%)');
    if (observedIdx < 0 || expectedIdx < 0) {
      if (rhBaselineIdx >= 0 && expectedRhBaselineIdx >= 0) {
        return seriesNames.map((_, idx) => (
          idx === expectedRhBaselineIdx ? rhBaselineIdx : idx
        ));
      }
      return undefined;
    }
    return seriesNames.map((_, idx) => (
      idx === expectedIdx || idx === expectedBaselineIdx ? observedIdx : idx
    ));
  }, [disableAutoAxisGrouping, overlayMetricCount, seriesNames]);
  const chartMetricRanges = useMemo(() => {
    if (!axisGroupBySeries) {
      return comparableRanges;
    }
    const merged = [...comparableRanges];
    const groupToIndices = new Map<number, number[]>();
    axisGroupBySeries.forEach((groupIdx, seriesIdx) => {
      const items = groupToIndices.get(groupIdx) ?? [];
      items.push(seriesIdx);
      groupToIndices.set(groupIdx, items);
    });
    groupToIndices.forEach((indices, groupIdx) => {
      const ranges = indices
        .map((i) => comparableRanges[i])
        .filter((r): r is AxisRange => Boolean(r));
      if (!ranges.length) return;
      merged[groupIdx] = {
        min: Math.min(...ranges.map((r) => r.min)),
        max: Math.max(...ranges.map((r) => r.max)),
      };
    });
    return merged;
  }, [axisGroupBySeries, comparableRanges]);
  const paddedChartMetricRanges = useMemo(() => {
    return chartMetricRanges.map((range) => {
      const span = Math.max(1, range.max - range.min);
      const pad = span * 0.05; // extra headroom to avoid top clipping in short windows
      return {
        min: range.min - pad,
        max: range.max + pad,
      };
    });
  }, [chartMetricRanges]);

  const chartOptions = useChartOptions(
    paddedChartMetricRanges,
    tooltipCategories,
    xAxisLabels,
    overlayMetricCount,
    seriesNames,
    axisGroupBySeries,
    thresholds,
    normalizeDeviation,
    tooltipValueOverrides,
    Boolean(activeOverlaySeries && activeOverlaySeries.length >= 2),
    showLegend,
    showXAxisLabels
  );

  const chartNode = useMemo(
    () => (
      <Chart
        height={chartHeight}
        options={chartOptions}
        series={combinedSeries}
        type="line"
      />
    ),
    [chartHeight, chartOptions, combinedSeries]
  );

  const maskPercents = useMemo(() => {
    if (!highlightActive || !highlightRange || !pointTimestamps || pointTimestamps.length < 2) {
      return null;
    }

    const pointMs = pointTimestamps.map((iso) => new Date(iso).getTime());
    const inferredBucketMs = pointMs.length > 1
      ? Math.max(1, Math.abs(pointMs[1] - pointMs[0]))
      : Math.max(1, highlightRange.endMs - highlightRange.startMs);
    let firstOverlapIndex: number | null = null;
    let lastOverlapIndex: number | null = null;

    for (let i = 0; i < pointMs.length; i += 1) {
      const bucketStartMs = pointMs[i];
      const bucketEndMs = bucketStartMs + inferredBucketMs;
      const overlaps =
        bucketEndMs > highlightRange.startMs &&
        bucketStartMs < highlightRange.endMs;

      if (!overlaps) {
        continue;
      }

      if (firstOverlapIndex == null) {
        firstOverlapIndex = i;
      }
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
      rightPct: Math.max(0, Math.min(100, rightPct))
    };
  }, [highlightActive, highlightRange, pointTimestamps]);

  const thresholdEnvelopePaths = useMemo(() => {
    if (!plotBounds || !activeOverlaySeries || activeOverlaySeries.length < 2) {
      return null;
    }
    const rangeForSeries = (seriesIdx: number): AxisRange => {
      const groupedIdx = axisGroupBySeries?.[seriesIdx] ?? seriesIdx;
      return paddedChartMetricRanges[groupedIdx] ?? paddedChartMetricRanges[0] ?? { min: 0, max: 1 };
    };

    const tempCenterSeriesIdx = thresholdBandCenterSeries?.temp;
    const rhObservedCenterSeriesIdx = thresholdBandCenterSeries?.rhObserved ?? thresholdBandCenterSeries?.rh;
    const rhExpectedCenterSeriesIdx = thresholdBandCenterSeries?.rhExpected;
    const rhExpectedBaselineCenterSeriesIdx = thresholdBandCenterSeries?.rhExpectedBaseline;
    const moistureCenterSeriesIdx = thresholdBandCenterSeries?.moisture;

    const tempBaseline = (
      typeof tempCenterSeriesIdx === 'number' &&
      tempCenterSeriesIdx >= 0 &&
      activeChartSeries[tempCenterSeriesIdx]?.data?.length
    )
      ? (activeChartSeries[tempCenterSeriesIdx]?.data ?? [])
      : (activeOverlaySeries[0]?.data ?? []);
    const rhObservedBaseline = (
      typeof rhObservedCenterSeriesIdx === 'number' &&
      rhObservedCenterSeriesIdx >= 0 &&
      activeChartSeries[rhObservedCenterSeriesIdx]?.data?.length
    )
      ? (activeChartSeries[rhObservedCenterSeriesIdx]?.data ?? [])
      : (activeOverlaySeries[1]?.data ?? []);
    if (!tempBaseline.length || !rhObservedBaseline.length) {
      return null;
    }

    const tempUpper = normalizeDeviation
      ? tempBaseline.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
      : tempBaseline.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
    const tempLower = normalizeDeviation
      ? tempBaseline.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
      : tempBaseline.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));
    const rhObservedUpper = normalizeDeviation
      ? rhObservedBaseline.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
      : rhObservedBaseline.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
    const rhObservedLower = normalizeDeviation
      ? rhObservedBaseline.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
      : rhObservedBaseline.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));

    const expectedRhSeriesIdx = activeChartSeries.findIndex(
      (s) => s.name.includes('Expected RH') && !s.name.includes('Baseline')
    );
    const rhExpectedBaseline = (
      typeof rhExpectedCenterSeriesIdx === 'number' &&
      rhExpectedCenterSeriesIdx >= 0 &&
      activeChartSeries[rhExpectedCenterSeriesIdx]?.data?.length
    )
      ? (activeChartSeries[rhExpectedCenterSeriesIdx]?.data ?? [])
      : (
        expectedRhSeriesIdx >= 0
          ? (activeChartSeries[expectedRhSeriesIdx]?.data ?? [])
          : []
      );
    const rhExpectedUpper = normalizeDeviation
      ? rhExpectedBaseline.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
      : rhExpectedBaseline.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
    const rhExpectedLower = normalizeDeviation
      ? rhExpectedBaseline.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
      : rhExpectedBaseline.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));

    const rhExpectedBaselineOverlayIdx = activeOverlaySeries.findIndex((s) =>
      s.name.includes('Expected RH Baseline')
    );
    const rhExpectedBaselineSeries = (
      typeof rhExpectedBaselineCenterSeriesIdx === 'number' &&
      rhExpectedBaselineCenterSeriesIdx >= 0 &&
      activeChartSeries[rhExpectedBaselineCenterSeriesIdx]?.data?.length
    )
      ? (activeChartSeries[rhExpectedBaselineCenterSeriesIdx]?.data ?? [])
      : (
        rhExpectedBaselineOverlayIdx >= 0
          ? (activeOverlaySeries[rhExpectedBaselineOverlayIdx]?.data ?? [])
          : []
      );
    const rhExpectedBaselineUpper = normalizeDeviation
      ? rhExpectedBaselineSeries.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
      : rhExpectedBaselineSeries.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
    const rhExpectedBaselineLower = normalizeDeviation
      ? rhExpectedBaselineSeries.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
      : rhExpectedBaselineSeries.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));

    const moistureSeriesIdx = activeChartSeries.findIndex((s) => s.name.includes('Moisture'));
    const moistureBaseline = (
      typeof moistureCenterSeriesIdx === 'number' &&
      moistureCenterSeriesIdx >= 0 &&
      activeChartSeries[moistureCenterSeriesIdx]?.data?.length
    )
      ? (activeChartSeries[moistureCenterSeriesIdx]?.data ?? [])
      : (
        moistureSeriesIdx >= 0
          ? (activeOverlaySeries[moistureSeriesIdx]?.data ?? [])
          : (activeOverlaySeries[2]?.data ?? [])
      );
    const moistureUpper = normalizeDeviation
      ? moistureBaseline.map((v) => (typeof v === 'number' ? thresholdPct * 100 : null))
      : moistureBaseline.map((v) => (typeof v === 'number' ? v * (1 + thresholdPct) : null));
    const moistureLower = normalizeDeviation
      ? moistureBaseline.map((v) => (typeof v === 'number' ? -thresholdPct * 100 : null))
      : moistureBaseline.map((v) => (typeof v === 'number' ? v * (1 - thresholdPct) : null));

    const tempRange = rangeForSeries(typeof tempCenterSeriesIdx === 'number' ? tempCenterSeriesIdx : 0);
    const rhObservedRange = rangeForSeries(typeof rhObservedCenterSeriesIdx === 'number' ? rhObservedCenterSeriesIdx : 1);
    const rhExpectedRange = rangeForSeries(typeof rhExpectedCenterSeriesIdx === 'number' ? rhExpectedCenterSeriesIdx : 2);
    const rhExpectedBaselineRange = rangeForSeries(
      typeof rhExpectedBaselineCenterSeriesIdx === 'number'
        ? rhExpectedBaselineCenterSeriesIdx
        : (typeof rhExpectedCenterSeriesIdx === 'number' ? rhExpectedCenterSeriesIdx : 2)
    );
    const moistureRange = rangeForSeries(
      typeof moistureCenterSeriesIdx === 'number'
        ? moistureCenterSeriesIdx
        : (moistureSeriesIdx >= 0 ? moistureSeriesIdx : 2)
    );
    const tempPath = buildEnvelopePath(tempUpper, tempLower, plotBounds, tempRange.min, tempRange.max);
    const rhObservedPath = buildEnvelopePath(rhObservedUpper, rhObservedLower, plotBounds, rhObservedRange.min, rhObservedRange.max);
    const rhExpectedPath = rhExpectedBaseline.length
      ? buildEnvelopePath(rhExpectedUpper, rhExpectedLower, plotBounds, rhExpectedRange.min, rhExpectedRange.max)
      : null;
    const rhExpectedBaselinePath = rhExpectedBaselineSeries.length
      ? buildEnvelopePath(
          rhExpectedBaselineUpper,
          rhExpectedBaselineLower,
          plotBounds,
          rhExpectedBaselineRange.min,
          rhExpectedBaselineRange.max
        )
      : null;
    const moisturePath = moistureBaseline.length
      ? buildEnvelopePath(
          moistureUpper,
          moistureLower,
          plotBounds,
          moistureRange.min,
          moistureRange.max
        )
      : null;

    if (!tempPath && !rhObservedPath && !rhExpectedPath && !rhExpectedBaselinePath && !moisturePath) return null;
    return { tempPath, rhObservedPath, rhExpectedPath, rhExpectedBaselinePath, moisturePath };
  }, [activeChartSeries, activeOverlaySeries, axisGroupBySeries, normalizeDeviation, paddedChartMetricRanges, plotBounds, thresholdBandCenterSeries?.moisture, thresholdBandCenterSeries?.rh, thresholdBandCenterSeries?.rhExpected, thresholdBandCenterSeries?.rhExpectedBaseline, thresholdBandCenterSeries?.rhObserved, thresholdBandCenterSeries?.temp, thresholdPct]);

  useEffect(() => {
    const measure = () => {
      const frame = chartFrameRef.current;
      if (!frame) return;

      const rootRect = frame.getBoundingClientRect();
      const gridEl =
        frame.querySelector('.apexcharts-grid') ||
        frame.querySelector('.apexcharts-inner');

      if (!gridEl || !(gridEl instanceof Element)) {
        setPlotBounds(null);
        return;
      }

      const gridRect = gridEl.getBoundingClientRect();
      if (!gridRect.width || !gridRect.height) {
        setPlotBounds(null);
        return;
      }

      setPlotBounds({
        left: gridRect.left - rootRect.left,
        top: gridRect.top - rootRect.top,
        width: gridRect.width,
        height: gridRect.height,
        frameWidth: rootRect.width,
        frameHeight: rootRect.height,
      });
    };

    measure();
    const rafId = typeof globalThis !== 'undefined' && globalThis.window
      ? globalThis.window.requestAnimationFrame(measure)
      : 0;
    const timeoutIds: number[] = [];
    if (typeof globalThis !== 'undefined' && globalThis.window) {
      [120, 260, 420].forEach((ms) => {
        timeoutIds.push(globalThis.window.setTimeout(measure, ms));
      });
    }
    let resizeObserver: ResizeObserver | null = null;
    if (typeof globalThis !== 'undefined' && globalThis.window) {
      globalThis.window.addEventListener('resize', measure);
      if (typeof ResizeObserver !== 'undefined' && chartFrameRef.current) {
        resizeObserver = new ResizeObserver(() => {
          measure();
        });
        resizeObserver.observe(chartFrameRef.current);
      }
      return () => {
        globalThis.window.removeEventListener('resize', measure);
        if (rafId) {
          globalThis.window.cancelAnimationFrame(rafId);
        }
        timeoutIds.forEach((id) => globalThis.window.clearTimeout(id));
        resizeObserver?.disconnect();
      };
    }
    return undefined;
  }, [activeChartSeries, xAxisLabels, tooltipCategories, layoutSignal]);


  return (
    <Box
      ref={chartFrameRef}
      sx={{ position: 'relative' }}
    >
      {chartNode}
      {thresholdEnvelopePaths && (
        <Box
          component="svg"
          viewBox={`0 0 ${plotBounds?.frameWidth ?? 1} ${plotBounds?.frameHeight ?? 1}`}
          sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {(() => {
            return (
              <>
          {thresholdBandVisibility.temp && thresholdEnvelopePaths.tempPath && (
            <path d={thresholdEnvelopePaths.tempPath} fill={theme.palette.primary.main} fillOpacity={0.08} />
          )}
          {Boolean(thresholdBandVisibility.rh ?? thresholdBandVisibility.rhObserved) && thresholdEnvelopePaths.rhObservedPath && (
            <path d={thresholdEnvelopePaths.rhObservedPath} fill={theme.palette.warning.main} fillOpacity={0.08} />
          )}
          {Boolean(thresholdBandVisibility.rhExpected) && thresholdEnvelopePaths.rhExpectedPath && (
            <path d={thresholdEnvelopePaths.rhExpectedPath} fill={theme.palette.warning.main} fillOpacity={0.08} />
          )}
          {Boolean(thresholdBandVisibility.rhExpectedBaseline) && thresholdEnvelopePaths.rhExpectedBaselinePath && (
            <path d={thresholdEnvelopePaths.rhExpectedBaselinePath} fill={theme.palette.info.main} fillOpacity={0.08} />
          )}
          {thresholdBandVisibility.moisture && thresholdEnvelopePaths.moisturePath && (
            <path d={thresholdEnvelopePaths.moisturePath} fill={theme.palette.info.main} fillOpacity={0.08} />
          )}
              </>
            );
          })()}
        </Box>
      )}
      {maskPercents && (
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
              top: plotBounds?.top ?? 44,
              height: plotBounds?.height ?? 'auto',
              left: plotBounds?.left ?? 0,
              width: plotBounds ? `${(maskPercents.leftPct / 100) * plotBounds.width}px` : `${maskPercents.leftPct}%`,
              backgroundColor: alpha('#ffffff', 0.8)
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: plotBounds?.top ?? 44,
              height: plotBounds?.height ?? 'auto',
              left: plotBounds
                ? plotBounds.left + plotBounds.width - (maskPercents.rightPct / 100) * plotBounds.width
                : undefined,
              right: plotBounds ? undefined : 0,
              width: plotBounds ? `${(maskPercents.rightPct / 100) * plotBounds.width}px` : `${maskPercents.rightPct}%`,
              backgroundColor: alpha('#ffffff', 0.8)
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export const TimeSeriesChart = memo(TimeSeriesChartComponent);
TimeSeriesChart.displayName = 'TimeSeriesChart';
