import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Unstable_Grid2 as Grid,
  CardHeader
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { TimeContextControls } from '../../components/time-context-controls';
import { useTimeContext } from '../../contexts/time-context';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { paths } from '../../paths';
import { AlertDetailsDrawer } from '../../sections/dashboard/alerts/alert-details-drawer';
import type { Alert, AlertCategory, AlertStatus } from '../../types/alert';
import { useESP32Aggregates } from '@/hooks/use-esp32';
import { buildThresholdEvents } from '@/utils/build-threshold-events';
import type { ThresholdEvent, ThresholdMetric } from '@/types/esp32-events';
import type { ESP32Aggregate } from '@/types/esp32-data';
import { ThreeMpSharp } from '@mui/icons-material';

const EVENT_BUCKET_SECONDS = 3600;
const EVENT_SOURCE_WINDOW_DAYS = 30;

const categories: Array<{ label: string; value: 'all' | AlertCategory }> = [
  { label: 'All', value: 'all' },
  { label: 'Humidity', value: 'rh' },
  { label: 'Temperature', value: 'temp' },
  { label: 'Both', value: 'both' }
];

const statuses: Array<{ label: string; value: 'all' | AlertStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Short', value: 'short' },
  { label: 'Sustained', value: 'sustained' }
];

const getSeverityColor = (severity: Alert['severity']) => {
  if (severity === 'extreme' || severity === 'critical') {
    return 'error';
  }

  if (severity === 'moderate' || severity === 'warning') {
    return 'warning';
  }

  return 'info';
};

const getSeverityFromDeviation = (
  deviationPctAbs: number,
  thresholdPct: number
): Extract<Alert['severity'], 'slight' | 'moderate' | 'extreme'> | null => {
  const thresholdPctPoints = thresholdPct * 100;
  if (deviationPctAbs < thresholdPctPoints) return null;
  if (deviationPctAbs >= thresholdPctPoints * 3) return 'extreme';
  if (deviationPctAbs >= thresholdPctPoints * 2) return 'moderate';
  return 'slight';
};

const formatDurationBucket = (durationMs: number): string => {
  const totalHours = Math.max(0, durationMs / (1000 * 60 * 60));
  const lower = Math.floor(totalHours);
  const upper = lower + 1;
  return `${lower}-${upper} hours`;
};

const capitalizeFirst = (text: string): string => (
  text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text
);

const toMs = (iso: string): number => new Date(iso).getTime();

const getDurationStatus = (event: ThresholdEvent): Extract<AlertStatus, 'short' | 'sustained'> => (
  event.durationMs > 60 * 60 * 1000 ? 'sustained' : 'short'
);

const getBreachedMetricsCategory = (event: ThresholdEvent): Extract<AlertCategory, 'temp' | 'rh' | 'both'> => {
  const hasTemp = event.breachedMetrics.includes('temp_f_avg');
  const hasRh = event.breachedMetrics.includes('rh_avg');
  if (hasTemp && hasRh) return 'both';
  if (hasTemp) return 'temp';
  return 'rh';
};

const getTimeOfDay = (date: Date): 'morning' | 'midday' | 'evening' | 'overnight' => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'overnight';
};

const describeTimeOfDaySpan = (event: ThresholdEvent): string => {
  const startLabel = getTimeOfDay(new Date(event.start_bucket));
  const endLabel = getTimeOfDay(new Date(event.end_bucket));
  return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
};

const formatTimeOfDaySpanLabel = (event: ThresholdEvent): string => {
  return describeTimeOfDaySpan(event)
    .replace(' to ', ' and ')
    .split(' ')
    .map((part) => toSentenceCase(part))
    .join(' ');
};

const formatEventTimeRangeLabel = (startAt: number, endAt: number, isActive = false): string => {
  const start = new Date(startAt);
  const endMs = isActive ? Date.now() : endAt;
  const end = new Date(endMs);
  const startLabel = format(start, 'haaa');
  const endLabel = isActive ? 'now' : format(end, 'haaa');
  const durationHours = Math.max(0, Math.round((endMs - startAt) / (1000 * 60 * 60)));
  return `${startLabel} — ${endLabel} (${durationHours}h)`;
};

const getMetricDirectionWord = (
  event: ThresholdEvent,
  metric: 'temp_f_avg' | 'rh_avg' | 'moisture_abs'
): 'peak' | 'dip' | null => {
  const breach = event.peakBreaches[metric];
  if (!breach) return null;
  return breach.direction === 'high' ? 'peak' : 'dip';
};

const getEventSeverity = (event: ThresholdEvent): Extract<Alert['severity'], 'slight' | 'moderate' | 'extreme'> => {
  const maxDeviation = Math.max(
    0,
    ...Object.values(event.peakBreaches)
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => Math.abs(b.deviationPct))
  );
  const thresholdPctPoints = event.settings.thresholdPct * 100;
  if (maxDeviation >= thresholdPctPoints * 3) return 'extreme';
  if (maxDeviation >= thresholdPctPoints * 2) return 'moderate';
  return 'slight';
};

const getMetricSeverity = (
  event: ThresholdEvent,
  metric: ThresholdMetric
): Extract<Alert['severity'], 'slight' | 'moderate' | 'extreme'> | null => {
  const deviation = event.peakDeviationPctByMetric[metric];
  const breach = event.peakBreaches[metric];
  if (!breach || typeof deviation !== 'number') {
    return null;
  }
  return getSeverityFromDeviation(Math.abs(deviation), event.settings.thresholdPct);
};

function toSentenceCase(str: string) {
  if (!str) {
    return "";
  }
  // Convert the entire string to lowercase first for consistency
  str = str.toLowerCase(); 

  // Capitalize the first character and concatenate with the rest of the string
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const toSeverityLabel = (severity: 'slight' | 'moderate' | 'extreme'): string => (
  severity === 'extreme' ? 'strong' : severity
);

const toTitleTextCase = (text: string): string => {
  const trimmed = text.trim().replace(/\.$/, '');
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const withRh = lower.replace(/\brh\b/g, 'RH');
  return `${withRh.charAt(0).toUpperCase()}${withRh.slice(1)}`;
};

const buildEventTitle = (event: ThresholdEvent): string => {
  const rhDir = getMetricDirectionWord(event, 'rh_avg');
  const moistureDir = getMetricDirectionWord(event, 'moisture_abs');
  const tempDir = getMetricDirectionWord(event, 'temp_f_avg');
  const phrases: string[] = [];
  const breachedCount = [tempDir, rhDir, moistureDir].filter(Boolean).length;

  if (breachedCount === 1) {
    if (tempDir) {
      const sev = toSentenceCase(
        toSeverityLabel(getMetricSeverity(event, 'temp_f_avg') ?? getEventSeverity(event))
      );
      const shape = tempDir === 'peak' ? 'spike' : 'dip';
      return toTitleTextCase(`${sev} temperature ${shape}`);
    }
    if (rhDir) {
      const sev = toSentenceCase(
        toSeverityLabel(getMetricSeverity(event, 'rh_avg') ?? getEventSeverity(event))
      );
      const shape = rhDir === 'peak' ? 'spike' : 'dip';
      return toTitleTextCase(`${sev} RH ${shape}`);
    }
    if (moistureDir) {
      const sev = toSentenceCase(
        toSeverityLabel(getMetricSeverity(event, 'moisture_abs') ?? getEventSeverity(event))
      );
      const shape = moistureDir === 'peak' ? 'spike' : 'dip';
      return toTitleTextCase(`${sev} moisture ${shape}`);
    }
  }

  if (moistureDir && tempDir && rhDir) {
    const moistureSeverity = toSentenceCase(
      toSeverityLabel(getMetricSeverity(event, 'moisture_abs') ?? getEventSeverity(event))
    );
    const tempSeverity = toSentenceCase(
      toSeverityLabel(getMetricSeverity(event, 'temp_f_avg') ?? getEventSeverity(event))
    );

    if (rhDir === 'dip') {
      if (tempDir === 'peak' && moistureDir === 'peak') {
        return toTitleTextCase(`${tempSeverity} temperature spike driving RH down despite ${moistureSeverity} moisture spike`);
      }
      if (tempDir === 'peak' && moistureDir === 'dip') {
        return toTitleTextCase(`${tempSeverity} temperature spike and ${moistureSeverity} moisture dip driving RH down`);
      }
      if (tempDir === 'dip' && moistureDir === 'dip') {
        return toTitleTextCase(`${moistureSeverity} moisture dip driving RH down despite ${tempSeverity} temperature dip`);
      }
      return toTitleTextCase(`Unexplained RH dip despite ${tempSeverity} temperature dip and ${moistureSeverity} moisture spike`);
    }

    if (tempDir === 'peak' && moistureDir === 'peak') {
      return toTitleTextCase(`${moistureSeverity} moisture spike driving RH up despite ${tempSeverity} temperature spike`);
    }
    if (tempDir === 'dip' && moistureDir === 'dip') {
      return toTitleTextCase(`${tempSeverity} temperature dip driving RH up despite ${moistureSeverity} moisture dip`);
    }
    if (tempDir === 'dip' && moistureDir === 'peak') {
      return toTitleTextCase(`${tempSeverity} temperature dip and ${moistureSeverity} moisture spike driving RH up`);
    }
    return toTitleTextCase(`Unexplained RH spike despite ${tempSeverity} temperature spike and ${moistureSeverity} moisture dip`);
  }

  if (moistureDir) {
    const moistureSeverity = toSentenceCase(
      toSeverityLabel(getMetricSeverity(event, 'moisture_abs') ?? getEventSeverity(event))
    );
    const rhDirection = moistureDir === 'peak' ? 'up' : 'down';
    const moistureShape = moistureDir === 'peak' ? 'spike' : 'dip';
    phrases.push(`${moistureSeverity} moisture ${moistureShape} driving RH ${rhDirection}`);
  }

  if (tempDir) {
    const tempSeverity = toSentenceCase(
      toSeverityLabel(getMetricSeverity(event, 'temp_f_avg') ?? getEventSeverity(event))
    );
    const rhDirection = tempDir === 'peak' ? 'down' : 'up';
    const tempShape = tempDir === 'peak' ? 'spike' : 'dip';
    phrases.push(`${tempSeverity} temperature ${tempShape} driving RH ${rhDirection}`);
  }

  return phrases.length ? toTitleTextCase(phrases.join(' • ')) : 'threshold event';
};

const buildEventDescription = (event: ThresholdEvent): string => {
  const timeSpan = describeTimeOfDaySpan(event);
  const rhDir = getMetricDirectionWord(event, 'rh_avg');
  const tempDir = getMetricDirectionWord(event, 'temp_f_avg');
  const isSustained = getDurationStatus(event) === 'sustained';
  const levelWord = (dir: 'peak' | 'dip' | null) => {
    if (dir === 'dip') return isSustained ? 'lows' : 'low';
    return isSustained ? 'highs' : 'high';
  };
  const rhSeverity = getMetricSeverity(event, 'rh_avg') ?? getEventSeverity(event);
  const tempSeverity = getMetricSeverity(event, 'temp_f_avg') ?? getEventSeverity(event);

  if (rhDir && tempDir) {
    return `${rhSeverity} ${levelWord(rhDir)} and ${tempSeverity} ${levelWord(tempDir)} ${timeSpan}.`;
  }

  const severity = getEventSeverity(event);
  const dirWord = rhDir ?? tempDir ?? 'peak';
  return `${severity} ${levelWord(dirWord)} ${timeSpan}.`;
};

const buildEventPreview = (event: ThresholdEvent, aggregates: ESP32Aggregate[]): Alert['preview'] => {
  const windowStartMs = toMs(event.start_bucket);
  const windowEndMs = toMs(event.end_bucket);
  const previewRows = aggregates
    .filter((agg) => {
      const startMs = toMs(agg.bucket_start);
      const endMs = toMs(agg.bucket_end);
      return startMs <= windowEndMs && endMs >= windowStartMs;
    })
    .sort((a, b) => toMs(a.bucket_start) - toMs(b.bucket_start));

  const categories = previewRows.map((agg) =>
    new Date(agg.bucket_start).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })
  );
  const hourBaselines = event.settings.baselineMethod === 'hour-of-day-mean'
    ? Array.from({ length: 24 }).reduce<Record<number, { temp?: number; rh?: number }>>((acc, _, hour) => {
        const hourRows = aggregates.filter((agg) => new Date(agg.bucket_start).getHours() === hour);
        const tempVals = hourRows.map((r) => r.temp_f_avg).filter((v): v is number => typeof v === 'number');
        const rhVals = hourRows.map((r) => r.rh_avg).filter((v): v is number => typeof v === 'number');
        acc[hour] = {
          temp: tempVals.length ? tempVals.reduce((s, v) => s + v, 0) / tempVals.length : undefined,
          rh: rhVals.length ? rhVals.reduce((s, v) => s + v, 0) / rhVals.length : undefined,
        };
        return acc;
      }, {})
    : {};

  const makeMetricPreview = (metric: 'temp_f_avg' | 'rh_avg') => {
    const values = previewRows.map((row) => (typeof row[metric] === 'number' ? row[metric] : null));
    const baselines = previewRows.map((row) => {
      if (event.settings.baselineMethod === 'hour-of-day-mean') {
        const hour = new Date(row.bucket_start).getHours();
        const hourly =
          metric === 'temp_f_avg'
            ? hourBaselines[hour]?.temp
            : hourBaselines[hour]?.rh;
        return typeof hourly === 'number' ? hourly : (event.baselineByMetric[metric] ?? null);
      }
      return event.baselineByMetric[metric] ?? null;
    });
    const baseline = baselines.find((v): v is number => typeof v === 'number') ?? null;
    const peakDeviation = event.peakDeviationPctByMetric[metric];
    const sign = typeof peakDeviation === 'number' && peakDeviation < 0 ? -1 : 1;
    const highlight = values.map((v) => {
      if (!event.peakBreaches[metric]) return null;
      if (typeof v !== 'number' || typeof baseline !== 'number') return null;
      const upper = baseline * (1 + event.settings.thresholdPct);
      const lower = baseline * (1 - event.settings.thresholdPct);
      const isHighlighted = sign >= 0 ? v >= upper : v <= lower;
      return isHighlighted ? v : null;
    });

    return { values, baselines, highlight };
  };

  return {
    categories,
    timestamps: previewRows.map((row) => row.bucket_start),
    thresholdPct: event.settings.thresholdPct,
    temp: makeMetricPreview('temp_f_avg'),
    rh: makeMetricPreview('rh_avg'),
  };
};

const eventToAlert = (
  event: ThresholdEvent,
  aggregates: ESP32Aggregate[],
  latestReadingMs: number
): Alert => {
  const category = getBreachedMetricsCategory(event);
  const severity = getEventSeverity(event);
  const status = getDurationStatus(event);
  const deviceId = 'esp32';
  const formatSignedPct = (value?: number) => {
    if (typeof value !== 'number') return 'n/a';
    const rounded = Math.round(value * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  };
  const rhDeviation = event.peakDeviationPctByMetric.rh_avg;
  const tempDeviation = event.peakDeviationPctByMetric.temp_f_avg;
  const moistureDeviation = event.peakDeviationPctByMetric.moisture_abs;

  const eventLastMs = Date.parse(event.last_ts);
  const isActive =
    Number.isFinite(eventLastMs) &&
    Number.isFinite(latestReadingMs) &&
    Math.abs(eventLastMs - latestReadingMs) <= 1000;
  const computedEndAt = isActive ? Date.now() : Date.parse(event.end_bucket);

  return {
    id: event.id,
    category,
    severity,
    status,
    title: buildEventTitle(event),
    description: capitalizeFirst(buildEventDescription(event)),
    locationId: 'home-office',
    locationName: 'Home Office',
    sensorId: deviceId,
    threshold: `Threshold ${Math.round(event.settings.thresholdPct * 100)}%; RH deviation ${formatSignedPct(rhDeviation)}; °F deviation ${formatSignedPct(tempDeviation)}; Moisture deviation ${formatSignedPct(moistureDeviation)}`,
    value: Math.round(event.durationMs / 1000),
    unit: 'duration',
    createdAt: Date.parse(event.start_bucket),
    startAt: Date.parse(event.start_bucket),
    endAt: computedEndAt,
    isActive,
    preview: buildEventPreview(event, aggregates),
  };
};

interface AlertsTableProps {
  showDrawer?: boolean;
  onSelectedAlertChange?: (alert: Alert | null) => void;
  onHoveredAlertChange?: (alert: Alert | null) => void;
  preloadedAggregates?: ESP32Aggregate[];
}

const AlertsTableComponent = ({
  showDrawer = true,
  onSelectedAlertChange,
  onHoveredAlertChange,
  preloadedAggregates
}: AlertsTableProps) => {
  const settings = useSettings();
  const theme = useTheme();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { from, to, thresholdBands } = useTimeContext();
  const eventSourceFrom = useMemo(
    () => new Date(to.getTime() - EVENT_SOURCE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    [to]
  );
  const {
    data: aggregatesData,
  } = useESP32Aggregates(
    {
      start_ts: eventSourceFrom.toISOString(),
      end_ts: to.toISOString(),
      bucket: EVENT_BUCKET_SECONDS, // fixed event standard
      order_desc: false,
      limit: 1000,
    },
    {
      enabled: !preloadedAggregates,
      staleTime: 60_000,
    }
  );
  const aggregates = useMemo(
    () => preloadedAggregates ?? aggregatesData?.aggregates ?? [],
    [aggregatesData?.aggregates, preloadedAggregates]
  );

  const { thresholdPct } = useTimeContext();
  const thresholdBandVisibility = useMemo(
    () => ({
      temp: thresholdBands.includes('temp'),
      rh: thresholdBands.includes('rh'),
      moisture: thresholdBands.includes('moisture'),
    }),
    [thresholdBands]
  );

  const events = useMemo(
    () =>
      buildThresholdEvents(aggregates, {
        thresholdPct: thresholdPct,
        expectedSamplePeriodSeconds: 2,
        baselineMethod: 'hour-of-day-mean',
      }),
    [aggregates, thresholdPct]
  );
  const allEventAlerts = useMemo(
    () => {
      const latestReadingMs = Math.max(
        0,
        ...aggregates.map((agg) => {
          const lastTs = Date.parse(agg.last_ts);
          return Number.isFinite(lastTs) ? lastTs : Date.parse(agg.bucket_end);
        })
      );
      return [...events]
        .sort((a, b) => Date.parse(b.start_bucket) - Date.parse(a.start_bucket))
        .map((event) => eventToAlert(event, aggregates, latestReadingMs));
    },
    [events, aggregates]
  );
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events]
  );

  const selectedCategory = useMemo<'all' | AlertCategory>(() => {
    const category = router.query.category;

    if (category === 'rh' || category === 'temp' || category === 'both') {
      return category;
    }

    return 'all';
  }, [router.query.category]);

  const selectedStatus = useMemo<'all' | AlertStatus>(() => {
    const status = router.query.status;

    if (status === 'short' || status === 'sustained') {
      return status;
    }

    return 'all';
  }, [router.query.status]);

  const selectedAlertId = useMemo<string | undefined>(() => {
    const alertId = router.query.alertId;

    if (typeof alertId === 'string') {
      return alertId;
    }

    return undefined;
  }, [router.query.alertId]);

  const updateFilters = useCallback((next: { category?: string; status?: string }) => {
    const nextQuery: Record<string, any> = {
      ...router.query,
      category: next.category ?? selectedCategory,
      status: next.status ?? selectedStatus
    };

    if (nextQuery.category === 'all') {
      delete nextQuery.category;
    }

    if (nextQuery.status === 'all') {
      delete nextQuery.status;
    }

    router.push(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const handleAlertSelect = useCallback((alertId: string): void => {
    const nextQuery: Record<string, any> = {
      ...router.query,
      alertId
    };

    if (selectedCategory !== 'all') {
      nextQuery.category = selectedCategory;
    }

    if (selectedStatus !== 'all') {
      nextQuery.status = selectedStatus;
    }

    router.push(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const handleDrawerClose = useCallback(() => {
    const nextQuery: Record<string, any> = {
      ...router.query
    };

    delete nextQuery.alertId;

    if (selectedCategory !== 'all') {
      nextQuery.category = selectedCategory;
    }

    if (selectedStatus !== 'all') {
      nextQuery.status = selectedStatus;
    }

    router.push(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const alerts = useMemo(() => {
    const filtered = allEventAlerts.filter((alert) => {
      const categoryMatch = selectedCategory === 'all' || alert.category === selectedCategory;
      const statusMatch = selectedStatus === 'all' || alert.status === selectedStatus;
      const eventStartTime = alert.startAt ?? alert.createdAt;
      const eventEndTime = alert.endAt ?? alert.createdAt;
      const timeMatch =
        eventStartTime <= to.getTime() &&
        eventEndTime >= from.getTime();
      return categoryMatch && statusMatch && timeMatch;
    });
    return filtered;
  }, [allEventAlerts, selectedCategory, selectedStatus, from, to]);

  const handleAlertSave = useCallback((_alertId: string, _updates: Partial<Alert>) => {
    // Event alerts are derived from aggregate data and threshold settings; edits are not persisted.
  }, []);

  useEffect(() => {
    if (selectedAlertId && !alerts.some((alert) => alert.id === selectedAlertId)) {
      handleDrawerClose();
    }
  }, [alerts, handleDrawerClose, selectedAlertId]);

  usePageView();

  const openCount = alerts.length;
  const environmentOpenCount = alerts.filter((alert) => (
    (alert.category === 'rh' || alert.category === 'temp' || alert.category === 'both') && alert.status === 'sustained'
  )).length;
  const systemOpenCount = alerts.filter((alert) => (
    alert.status === 'short'
  )).length;
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || null;

  useEffect(() => {
    onSelectedAlertChange?.(selectedAlert);
  }, [onSelectedAlertChange, selectedAlert]);
  const rowsWithDayHeaders = useMemo(() => {
    const rows: Array<
      | { kind: 'day'; key: string; label: string }
      | { kind: 'alert'; key: string; alert: Alert }
      | { kind: 'empty'; key: string; message: string }
    > = [];

    let previousDayKey: string | null = null;
    const now = new Date();
    const todayKey = format(now, 'yyyy-MM-dd');

    if (alerts.length === 0) {
      rows.push({
        kind: 'day',
        key: `day-${todayKey}`,
        label: `Today, ${format(now, 'MMM dd')}`
      });
      rows.push({
        kind: 'empty',
        key: 'empty-state',
        message: 'No events in this time window'
      });
      return rows;
    }

    for (const alert of alerts) {
      const alertDate = new Date(alert.createdAt);
      const dayKey = format(alertDate, 'yyyy-MM-dd');

      if (dayKey !== previousDayKey) {
        rows.push({
          kind: 'day',
          key: `day-${dayKey}`,
          label: dayKey === todayKey
            ? `Today, ${format(alertDate, 'MMM dd')}`
            : format(alertDate, 'EEE, MMM dd')
        });
        previousDayKey = dayKey;
      }

      rows.push({
        kind: 'alert',
        key: alert.id,
        alert
      });
    }

    return rows;
  }, [alerts]);

  return (
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
        <Stack spacing={3}>
          <Card>
            {/* <CardHeader 
              title={`Events`} 
              sx={{ mb: 2 }} /> */}
            <Divider />
            <Table>
              <TableHead>
                {/* <TableRow>
                  <TableCell>Alert</TableCell>
                  <TableCell>Deviation</TableCell>
                  {/* <TableCell>Duration</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Age</TableCell> 
                </TableRow> */}
              </TableHead>
              <TableBody>
                {rowsWithDayHeaders.map((row) => {
                  if (row.kind === 'day') {
                    return (
                      <TableRow 
                        key={row.key} 
                        sx={{ backgroundColor: 'action.hover' }}>
                        <TableCell
                          colSpan={2}
                          sx={{
                            py: 1,
                            borderBottomColor: 'divider'
                          }}
                        >
                          <Typography
                            color="text.primary"
                            variant="overline"
                            sx={{ opacity: 0.7, letterSpacing: 0.8 }}
                          >
                            {row.label}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (row.kind === 'empty') {
                    return (
                      <TableRow key={row.key}>
                        <TableCell 
                          colSpan={2} 
                          sx={{ py: 3 }}>
                          <Typography   
                            color="text.secondary" 
                            variant="body2">
                            {row.message}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const alert = row.alert;
                  const event = eventById.get(alert.id);
                  return (
                    <TableRow
                      hover
                      key={row.key}
                      onClick={() => handleAlertSelect(alert.id)}
                      onMouseEnter={() => onHoveredAlertChange?.(alert)}
                      onMouseLeave={() => onHoveredAlertChange?.(null)}
                      selected={selectedAlertId === alert.id}
                      sx={{
                        cursor: 'pointer',
                        '&.MuiTableRow-hover:hover': {
                          backgroundColor: `${alpha(theme.palette.primary.main, 0.12)} !important`
                        },
                        '&.Mui-selected, &.Mui-selected:hover': {
                          backgroundColor: `${alpha(theme.palette.primary.main, 0.12)} !important`
                        }
                      }}
                    >
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Typography 
                            variant="subtitle2" 
                            sx={{ whiteSpace: 'pre-line' }}>
                            {alert.title}
                          </Typography>
                          <Typography color="text.secondary"
                            variant="body2">
                            {alert.startAt && alert.endAt
                              ? formatEventTimeRangeLabel(alert.startAt, alert.endAt, Boolean(alert.isActive))
                              : (event ? formatTimeOfDaySpanLabel(event) : 'No event context')}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ verticalAlign: 'top' }}
                      >
                        <Stack
                          spacing={0.75}
                          sx={{
                            width: 'fit-content',
                            ml: 'auto',
                            alignItems: 'flex-end'
                          }}
                        >
                          {(['temp_f_avg', 'rh_avg', 'moisture_abs'] as const).map((metric) => {
                            const deviation = event?.peakDeviationPctByMetric[metric];
                            const thresholdPctValue = event?.settings.thresholdPct ?? thresholdPct;
                            const absDeviation = Math.abs(deviation ?? 0);
                            const metricSeverity = getSeverityFromDeviation(absDeviation, thresholdPctValue);
                            const rounded = typeof deviation === 'number' ? Math.round(deviation * 10) / 10 : 0;
                            const sign = rounded > 0 ? '+' : '';
                            const label =
                              metric === 'rh_avg'
                                ? `${sign}${rounded}% RH`
                                : metric === 'temp_f_avg'
                                  ? `${sign}${rounded}% °F`
                                  : `${sign}${rounded}% AH`;
                            const isPositive = rounded > 0;
                            const baseColor = metric === 'temp_f_avg'
                              ? theme.palette.primary.main
                              : metric === 'rh_avg'
                                ? theme.palette.warning.main
                                : theme.palette.info.main;
                            const tintAlpha =
                              metricSeverity === 'extreme' ? 0.34 :
                              metricSeverity === 'moderate' ? 0.22 :
                              metricSeverity === 'slight' ? 0.12 : 0;
                            const chipSx = {
                              color: metricSeverity ? baseColor : theme.palette.text.primary,
                              backgroundColor: metricSeverity ? alpha(baseColor, tintAlpha) : theme.palette.common.white,
                              borderColor: metricSeverity
                                ? (isPositive ? alpha(baseColor, 0.9) : 'transparent')
                                : theme.palette.divider,
                              borderWidth: 1,
                              borderStyle: 'solid'
                            };
                            return (
                              <Chip
                                key={metric}
                                label={label}
                                size="small"
                                variant={metricSeverity ? (isPositive ? 'outlined' : 'filled') : 'outlined'}
                                sx={chipSx}
                              />
                            );
                          })}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        <Stack  
            direction="row"
            justifyContent="flex-end">
            <Button
              component={NextLink}
              href={paths.dashboard.alerts}
              variant="text"
            >
              See all events
            </Button>
          </Stack>
        </Stack>
      </Box>
      {showDrawer && (
        <AlertDetailsDrawer
          alert={selectedAlert}
          container={rootRef.current}
          thresholdBandVisibility={thresholdBandVisibility}
          onClose={handleDrawerClose}
          onSave={handleAlertSave}
          open={Boolean(selectedAlertId)}
        />
      )}
    </Box>
  );
};

export const AlertsTable = memo(AlertsTableComponent);
AlertsTable.displayName = 'AlertsTable';
