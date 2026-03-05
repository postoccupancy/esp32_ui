import type { ESP32Aggregate } from '@/types/esp32-data';
import type {
  BuildThresholdEventsOptions,
  EventBreach,
  EventBucket,
  ThresholdEvent,
  ThresholdMetric,
} from '@/types/esp32-events';

const METRICS: ThresholdMetric[] = ['temp_f_avg', 'rh_avg', 'moisture_abs'];

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const mean = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const toAbsoluteHumidity = (tempF: number, rh: number): number | null => {
  const tempC = (tempF - 32) * (5 / 9);
  const saturationVp = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5)); // hPa
  const absoluteHumidity = (saturationVp * rh * 2.1674) / (273.15 + tempC); // g/m^3
  return Number.isFinite(absoluteHumidity) ? absoluteHumidity : null;
};

const toMs = (iso: string): number => new Date(iso).getTime();

const makeEventId = (
  startBucket: string,
  endBucket: string,
  bucketSeconds: number,
  thresholdPct: number
): string => {
  return `threshold-breach:${startBucket}:${endBucket}:b${bucketSeconds}:t${thresholdPct}`;
};

type BucketBreachState = {
  bucket: EventBucket;
  bucketStartMs: number;
  bucketEndMs: number;
  firstTsMs: number;
  lastTsMs: number;
  completenessPct: number;
  breaches: EventBreach[];
  deviationsByMetric: Partial<Record<ThresholdMetric, number>>;
};

export const buildThresholdEvents = (
  aggregates: ESP32Aggregate[],
  options: BuildThresholdEventsOptions
): ThresholdEvent[] => {
  const {
    thresholdPct,
    expectedSamplePeriodSeconds = 2,
    baselineMethod = 'window-mean',
  } = options;

  if (!aggregates.length) {
    return [];
  }

  const sorted = [...aggregates].sort(
    (a, b) => toMs(a.bucket_start) - toMs(b.bucket_start)
  );

  const inferredBucketSeconds = Math.round(
    (toMs(sorted[0].bucket_end) - toMs(sorted[0].bucket_start)) / 1000
  );
  if (!Number.isFinite(inferredBucketSeconds) || inferredBucketSeconds <= 0) {
    throw new Error('buildThresholdEvents: unable to infer a valid bucket size from aggregate data');
  }

  for (const agg of sorted) {
    const rowBucketSeconds = Math.round((toMs(agg.bucket_end) - toMs(agg.bucket_start)) / 1000);
    if (rowBucketSeconds !== inferredBucketSeconds) {
      throw new Error(
        `buildThresholdEvents: mixed aggregate bucket sizes detected (${inferredBucketSeconds}s and ${rowBucketSeconds}s)`
      );
    }
  }

  const windowBaselines: Partial<Record<ThresholdMetric, number>> = {
    temp_f_avg: mean(
      sorted
        .map((agg) => agg.temp_f_avg)
        .filter((v): v is number => isNumber(v))
    ) ?? undefined,
    rh_avg: mean(
      sorted
        .map((agg) => agg.rh_avg)
        .filter((v): v is number => isNumber(v))
    ) ?? undefined,
    moisture_abs: mean(
      sorted
        .map((agg) => (
          isNumber(agg.temp_f_avg) && isNumber(agg.rh_avg)
            ? toAbsoluteHumidity(agg.temp_f_avg, agg.rh_avg)
            : null
        ))
        .filter((v): v is number => isNumber(v))
    ) ?? undefined,
  };

  const hourOfDayBaselines: Record<number, Partial<Record<ThresholdMetric, number>>> = {};
  if (baselineMethod === 'hour-of-day-mean') {
    for (let hour = 0; hour < 24; hour += 1) {
      const rows = sorted.filter((agg) => new Date(agg.bucket_start).getHours() === hour);
      hourOfDayBaselines[hour] = {
        temp_f_avg: mean(
          rows.map((agg) => agg.temp_f_avg).filter((v): v is number => isNumber(v))
        ) ?? undefined,
        rh_avg: mean(
          rows.map((agg) => agg.rh_avg).filter((v): v is number => isNumber(v))
        ) ?? undefined,
        moisture_abs: mean(
          rows
            .map((agg) => (
              isNumber(agg.temp_f_avg) && isNumber(agg.rh_avg)
                ? toAbsoluteHumidity(agg.temp_f_avg, agg.rh_avg)
                : null
            ))
            .filter((v): v is number => isNumber(v))
        ) ?? undefined,
      };
    }
  }

  const expectedPerBucket = Math.max(
    1,
    Math.round(inferredBucketSeconds / expectedSamplePeriodSeconds)
  );
  const bucketMs = inferredBucketSeconds * 1000;

  const evaluated: BucketBreachState[] = sorted.map((agg) => {
    const bucket: EventBucket = {
      bucket_start: agg.bucket_start,
      bucket_end: agg.bucket_end,
      first_ts: agg.first_ts,
      last_ts: agg.last_ts,
      count: agg.count,
      temp_f_avg: agg.temp_f_avg ?? null,
      rh_avg: agg.rh_avg ?? null,
      moisture_abs: (
        isNumber(agg.temp_f_avg) && isNumber(agg.rh_avg)
          ? toAbsoluteHumidity(agg.temp_f_avg, agg.rh_avg)
          : null
      ),
    };

    const breaches: EventBreach[] = [];
    const deviationsByMetric: Partial<Record<ThresholdMetric, number>> = {};

    const hour = new Date(agg.bucket_start).getHours();
    const tempBaseline =
      baselineMethod === 'hour-of-day-mean'
        ? hourOfDayBaselines[hour]?.temp_f_avg ?? windowBaselines.temp_f_avg
        : windowBaselines.temp_f_avg;
    const rhBaseline =
      baselineMethod === 'hour-of-day-mean'
        ? hourOfDayBaselines[hour]?.rh_avg ?? windowBaselines.rh_avg
        : windowBaselines.rh_avg;

    const tempValue = agg.temp_f_avg;
    if (isNumber(tempValue) && isNumber(tempBaseline) && tempBaseline !== 0) {
      const tempDeviationPct = ((tempValue - tempBaseline) / tempBaseline) * 100;
      const roundedTempDeviation = Math.round(tempDeviationPct * 10) / 10;
      deviationsByMetric.temp_f_avg = roundedTempDeviation;
      const tempBreached = Math.abs(tempValue - tempBaseline) > Math.abs(tempBaseline) * thresholdPct;
      if (tempBreached) {
        breaches.push({
          metric: 'temp_f_avg',
          value: tempValue,
          baseline: tempBaseline,
          deviationPct: roundedTempDeviation,
          direction: tempDeviationPct >= 0 ? 'high' : 'low',
        });
      }
    }

    const rhValue = agg.rh_avg;
    if (isNumber(rhValue) && isNumber(rhBaseline) && rhBaseline !== 0 && isNumber(tempValue)) {
      const expectedRh = isNumber(tempBaseline) && tempBaseline !== 0
        ? rhBaseline * (1 - ((tempValue - tempBaseline) / tempBaseline))
        : null;
      if (isNumber(expectedRh) && expectedRh !== 0) {
        const expectedRhDeviationPct = ((rhValue - expectedRh) / expectedRh) * 100;
        const roundedRhDeviation = Math.round(expectedRhDeviationPct * 10) / 10;
        deviationsByMetric.rh_avg = roundedRhDeviation;

        const rhBreached =
          Math.abs(rhValue - expectedRh) > Math.abs(expectedRh) * thresholdPct;
        if (rhBreached) {
          breaches.push({
            metric: 'rh_avg',
            value: rhValue,
            baseline: expectedRh,
            deviationPct: roundedRhDeviation,
            direction: expectedRhDeviationPct >= 0 ? 'high' : 'low',
          });
        }
      }
    }

    const moistureValue = (
      isNumber(tempValue) && isNumber(rhValue)
        ? toAbsoluteHumidity(tempValue, rhValue)
        : null
    );
    const moistureBaseline =
      baselineMethod === 'hour-of-day-mean'
        ? hourOfDayBaselines[hour]?.moisture_abs ?? windowBaselines.moisture_abs
        : windowBaselines.moisture_abs;
    if (isNumber(moistureValue) && isNumber(moistureBaseline) && moistureBaseline !== 0) {
      const moistureDeviationPct = ((moistureValue - moistureBaseline) / moistureBaseline) * 100;
      const roundedMoistureDeviation = Math.round(moistureDeviationPct * 10) / 10;
      deviationsByMetric.moisture_abs = roundedMoistureDeviation;
      const moistureBreached =
        Math.abs(moistureValue - moistureBaseline) > Math.abs(moistureBaseline) * thresholdPct;
      if (moistureBreached) {
        breaches.push({
          metric: 'moisture_abs',
          value: moistureValue,
          baseline: moistureBaseline,
          deviationPct: roundedMoistureDeviation,
          direction: moistureDeviationPct >= 0 ? 'high' : 'low',
        });
      }
    }

    const completenessPct = Math.max(
      0,
      Math.min(100, (agg.count / expectedPerBucket) * 100)
    );

    return {
      bucket,
      bucketStartMs: toMs(agg.bucket_start),
      bucketEndMs: toMs(agg.bucket_end),
      firstTsMs: toMs(agg.first_ts),
      lastTsMs: toMs(agg.last_ts),
      completenessPct,
      breaches,
      deviationsByMetric,
    };
  });

  const events: ThresholdEvent[] = [];
  let active: BucketBreachState[] = [];

  const flushActive = () => {
    if (!active.length) return;

    const first = active[0];
    const last = active[active.length - 1];

    const breachedMetricSet = new Set<ThresholdMetric>();
    const peakBreaches: Partial<Record<ThresholdMetric, EventBreach>> = {};
    const peakDeviationPctByMetric: Partial<Record<ThresholdMetric, number>> = {};
    let breachCount = 0;
    let incompleteBuckets = 0;
    let minCompletenessPct = 100;
    let firstTsMs = Number.POSITIVE_INFINITY;
    let lastTsMs = Number.NEGATIVE_INFINITY;

    for (const state of active) {
      if (state.completenessPct < 100) {
        incompleteBuckets += 1;
      }
      minCompletenessPct = Math.min(minCompletenessPct, state.completenessPct);
      firstTsMs = Math.min(firstTsMs, state.firstTsMs);
      lastTsMs = Math.max(lastTsMs, state.lastTsMs);

      for (const breach of state.breaches) {
        breachCount += 1;
        breachedMetricSet.add(breach.metric);
        const prevPeak = peakBreaches[breach.metric];
        if (!prevPeak || Math.abs(breach.deviationPct) > Math.abs(prevPeak.deviationPct)) {
          peakBreaches[breach.metric] = breach;
        }
      }

      for (const metric of METRICS) {
        const deviation = state.deviationsByMetric[metric];
        if (!isNumber(deviation)) continue;
        const prevDeviation = peakDeviationPctByMetric[metric];
        if (!isNumber(prevDeviation) || Math.abs(deviation) > Math.abs(prevDeviation)) {
          peakDeviationPctByMetric[metric] = deviation;
        }
      }
    }

    const durationBuckets = active.length;
    const start_bucket = first.bucket.bucket_start;
    const end_bucket = last.bucket.bucket_end;

    events.push({
      id: makeEventId(start_bucket, end_bucket, inferredBucketSeconds, thresholdPct),
      type: 'threshold-breach',
      bucketSeconds: inferredBucketSeconds,
      start_bucket,
      end_bucket,
      durationBuckets,
      durationMs: durationBuckets * bucketMs,
      first_ts: new Date(firstTsMs).toISOString(),
      last_ts: new Date(lastTsMs).toISOString(),
      breachedMetrics: [...breachedMetricSet],
      peakBreaches,
      peakDeviationPctByMetric,
      baselineByMetric: {
        temp_f_avg: peakBreaches.temp_f_avg?.baseline ?? windowBaselines.temp_f_avg,
        rh_avg: peakBreaches.rh_avg?.baseline ?? windowBaselines.rh_avg,
        moisture_abs: peakBreaches.moisture_abs?.baseline ?? windowBaselines.moisture_abs,
      },
      breachCount,
      buckets: active.map((s) => s.bucket),
      incompleteBuckets,
      minCompletenessPct: Math.round(minCompletenessPct * 10) / 10,
      settings: {
        thresholdPct,
        expectedSamplePeriodSeconds,
        bucketSeconds: inferredBucketSeconds,
        baselineMethod,
      },
    });

    active = [];
  };

  for (const state of evaluated) {
    const isBreachedBucket = state.breaches.length > 0;

    if (!isBreachedBucket) {
      flushActive();
      continue;
    }

    if (!active.length) {
      active.push(state);
      continue;
    }

    const prev = active[active.length - 1];
    const isConsecutive = state.bucketStartMs - prev.bucketStartMs === bucketMs;

    if (!isConsecutive) {
      flushActive();
      active.push(state);
      continue;
    }

    active.push(state);
  }

  flushActive();

  return events;
};
