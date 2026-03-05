export type ThresholdMetric = 'temp_f_avg' | 'rh_avg' | 'moisture_abs';

export type ThresholdRule = {
  metric: ThresholdMetric;
  baseline: number;        // current window baseline used for comparison (e.g. mean)
  thresholdPct: number;    // e.g. 0.10 for +/-10%
};

export type EventBucket = {
  bucket_start: string;
  bucket_end: string;
  first_ts: string;
  last_ts: string;
  count: number;
  temp_f_avg?: number | null;
  rh_avg?: number | null;
  moisture_abs?: number | null;
};

export type EventBreach = {
  metric: ThresholdMetric;
  value: number;
  baseline: number;
  deviationPct: number;    // signed percent, e.g. +12.4 or -15.1
  direction: 'high' | 'low';
};

export type ThresholdEvent = {
  id: string;              // deterministic from start/end/config
  type: 'threshold-breach';
  bucketSeconds: number;

  // event window (bucket-aligned)
  start_bucket: string;
  end_bucket: string;
  durationBuckets: number;
  durationMs: number;

  // actual observed timestamps from contained buckets
  first_ts: string;
  last_ts: string;

  // what caused it
  breachedMetrics: ThresholdMetric[];   // union over all buckets in event
  peakBreaches: Partial<Record<ThresholdMetric, EventBreach>>; // max abs deviation seen
  peakDeviationPctByMetric: Partial<Record<ThresholdMetric, number>>; // max abs signed deviation, breached or not
  baselineByMetric: Partial<Record<ThresholdMetric, number>>; // window baseline used for each metric
  breachCount: number;                  // total metric breaches across all buckets

  // data quality/context
  buckets: EventBucket[];               // optional now, can omit later for lighter payload
  incompleteBuckets: number;            // buckets below expected count
  minCompletenessPct: number;

  // event settings used to compute it (critical for reproducibility)
  settings: {
    thresholdPct: number;               // if shared across metrics
    expectedSamplePeriodSeconds: number; // 2
    bucketSeconds: number;
    baselineMethod: 'window-mean' | 'hour-of-day-mean';
  };
};

export type BuildThresholdEventsOptions = {
  thresholdPct: number; // e.g. 0.10
  expectedSamplePeriodSeconds?: number; // defaults to 2
  baselineMethod?: 'window-mean' | 'hour-of-day-mean';
};
