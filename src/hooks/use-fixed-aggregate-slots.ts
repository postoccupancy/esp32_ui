import { useMemo } from 'react';
import type { ESP32Aggregate } from '@/types/esp32';
import type { TimeWindow } from '@/contexts/time-context';
import { buildSparseTimeAxisLabels } from '@/utils/chart-utils';

// this is an optional hook for accepting an x-axis with fixed slots for all time values in an aggregation window
// this can lead to rendering issues with larger time windows with many buckets, so use with caution
// some time windows may be over 300k data points which can cause the browser to stall even if most are null

type FixedAggregateSlotsOptions = {
  aggregates: ESP32Aggregate[];
  from: Date;
  to: Date;
  bucketSeconds: number;
  window: TimeWindow;
};

export const useFixedAggregateSlots = ({
  aggregates,
  from,
  to,
  bucketSeconds,
  window,
}: FixedAggregateSlotsOptions) => {
  const bucketMs = bucketSeconds * 1000;

  const slotTimes = useMemo(() => {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const startAlignedMs = Math.floor(fromMs / bucketMs) * bucketMs;
    const endAlignedMs = Math.ceil(toMs / bucketMs) * bucketMs;
    const slots: number[] = [];

    for (let ts = startAlignedMs; ts <= endAlignedMs; ts += bucketMs) {
      slots.push(ts);
    }

    return slots;
  }, [from, to, bucketMs]);

  const aggregateByBucketMs = useMemo(() => {
    const byBucket = new Map<number, ESP32Aggregate>();
    for (const agg of aggregates) {
      byBucket.set(new Date(agg.bucket_start).getTime(), agg);
    }
    return byBucket;
  }, [aggregates]);

  const slotBucketStarts = useMemo(
    () => slotTimes.map((ts) => new Date(ts).toISOString()),
    [slotTimes]
  );

  const windowDays = useMemo(
    () => (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
    [from, to]
  );

  const tooltipCategories = useMemo(() => {
    return slotTimes.map((ts) => {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        weekday: windowDays > 1 ? 'short' : undefined,
        month: windowDays > 1 ? 'short' : undefined,
        day: windowDays > 1 ? 'numeric' : undefined,
        hour: 'numeric',
        minute: bucketSeconds < 3600 ? '2-digit' : undefined,
        second: bucketSeconds < 60 ? '2-digit' : undefined,
      });
    });
  }, [slotTimes, windowDays, bucketSeconds]);

  const xAxisLabels = useMemo(
    () => buildSparseTimeAxisLabels(slotBucketStarts, window),
    [slotBucketStarts, window]
  );

  return {
    slotTimes,
    aggregateByBucketMs,
    tooltipCategories,
    xAxisLabels,
  };
};

