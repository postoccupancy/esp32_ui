import type { FC, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { subDays, subHours, subMinutes } from 'date-fns';
import { useRouter } from 'next/router';

export type TimeWindow = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';
export type TimeBucket = '2s' | '10s' | '1m' | '5m' | '1h';

const DEFAULT_WINDOW: TimeWindow = '30d';
const DEFAULT_BUCKET: TimeBucket = '1h';

const WINDOWS: TimeWindow[] = ['15m', '1h', '6h', '24h', '7d', '30d'];
const BUCKETS: TimeBucket[] = ['2s', '10s', '1m', '5m', '1h'];
const MAX_AGGREGATE_POINTS = 1000;
const BUCKET_SECONDS: Record<TimeBucket, number> = {
  '2s': 2,
  '10s': 10,
  '1m': 60,
  '5m': 300,
  '1h': 3600
};

export const formatTimeWindowLabel = (window: TimeWindow): string => {
  switch (window) {
    case '15m':
      return 'Last 15 Minutes';
    case '1h':
      return 'Last Hour';
    case '6h':
      return 'Last 6 Hours';
    case '24h':
      return 'Last 24 Hours';
    case '7d':
      return 'Last 7 Days';
    case '30d':
      return 'Last 30 Days';
    default:
      return 'Last Hour';
  }
};

export const getTimeBucketSeconds = (bucket: TimeBucket): number => {
  return BUCKET_SECONDS[bucket];
};

const getWindowSeconds = (window: TimeWindow): number => {
  switch (window) {
    case '15m':
      return 15 * 60;
    case '1h':
      return 60 * 60;
    case '6h':
      return 6 * 60 * 60;
    case '24h':
      return 24 * 60 * 60;
    case '7d':
      return 7 * 24 * 60 * 60;
    case '30d':
      return 30 * 24 * 60 * 60;
    default:
      return 60 * 60;
  }
};

export const getExpectedAggregatePoints = (window: TimeWindow, bucket: TimeBucket): number => {
  return Math.ceil(getWindowSeconds(window) / getTimeBucketSeconds(bucket));
};

export const isBucketAllowedForWindow = (window: TimeWindow, bucket: TimeBucket): boolean => {
  return getExpectedAggregatePoints(window, bucket) <= MAX_AGGREGATE_POINTS;
};

export const getAllowedBucketsForWindow = (window: TimeWindow): TimeBucket[] => {
  return BUCKETS.filter((bucket) => isBucketAllowedForWindow(window, bucket));
};

const getFallbackBucketForWindow = (window: TimeWindow, preferred: TimeBucket): TimeBucket => {
  if (isBucketAllowedForWindow(window, preferred)) {
    return preferred;
  }
  const preferredIndex = BUCKETS.indexOf(preferred);
  // Choose the next coarser valid bucket first.
  for (let i = preferredIndex + 1; i < BUCKETS.length; i += 1) {
    if (isBucketAllowedForWindow(window, BUCKETS[i])) {
      return BUCKETS[i];
    }
  }
  // Fallback to the coarsest valid bucket (should always exist for current presets)
  const allowed = getAllowedBucketsForWindow(window);
  return allowed[allowed.length - 1] ?? DEFAULT_BUCKET;
};

interface TimeContextValue {
  window: TimeWindow;
  bucket: TimeBucket;
  bucketLabel: TimeBucket;
  bucketValue: number;
  allowedBuckets: TimeBucket[];
  from: Date;
  to: Date;
  setTo: (to: Date) => void;
  setWindow: (window: TimeWindow) => void;
  setBucket: (bucket: TimeBucket) => void;
}

const TimeContext = createContext<TimeContextValue | undefined>(undefined);

const getFromDate = (to: Date, window: TimeWindow): Date => {
  switch (window) {
    case '15m':
      return subMinutes(to, 15);
    case '1h':
      return subHours(to, 1);
    case '6h':
      return subHours(to, 6);
    case '24h':
      return subHours(to, 24);
    case '7d':
      return subDays(to, 7);
    case '30d':
      return subDays(to, 30);
    default:
      return subHours(to, 1);
  }
};

const asWindow = (value: string | string[] | undefined): TimeWindow | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return WINDOWS.includes(value as TimeWindow) ? (value as TimeWindow) : undefined;
};

const asBucket = (value: string | string[] | undefined): TimeBucket | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return BUCKETS.includes(value as TimeBucket) ? (value as TimeBucket) : undefined;
};

interface TimeProviderProps {
  children: ReactNode;
}

export const TimeProvider: FC<TimeProviderProps> = ({ children }) => {
  const router = useRouter();
  const [window, setWindowState] = useState<TimeWindow>(DEFAULT_WINDOW);
  const [bucket, setBucketState] = useState<TimeBucket>(DEFAULT_BUCKET);
  const [to, setTo] = useState<Date>(new Date());

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const queryWindow = asWindow(router.query.tcWindow);
    const queryBucket = asBucket(router.query.tcBucket);
    const nextWindow = queryWindow ?? window;
    const requestedBucket = queryBucket ?? bucket;
    const resolvedBucket = getFallbackBucketForWindow(nextWindow, requestedBucket);

    if (queryWindow) setWindowState(nextWindow);
    if (resolvedBucket !== bucket) setBucketState(resolvedBucket);

    // Keep URL/query state valid if someone manually enters a forbidden bucket.
    if ((queryWindow && queryWindow !== window) || (queryBucket && queryBucket !== resolvedBucket)) {
      router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            tcWindow: nextWindow,
            tcBucket: resolvedBucket
          }
        },
        undefined,
        { shallow: true }
      ).catch(() => undefined);
    }
  }, [router, router.isReady, router.query.tcBucket, router.query.tcWindow, bucket, window]);

  const syncQuery = useCallback(
    (nextWindow: TimeWindow, nextBucket: TimeBucket) => {
      const nextQuery = {
        ...router.query,
        tcWindow: nextWindow,
        tcBucket: nextBucket
      };

      router.replace(
        {
          pathname: router.pathname,
          query: nextQuery
        },
        undefined,
        { shallow: true }
      ).catch(() => undefined);
    },
    [router]
  );

  const setWindow = useCallback(
    (nextWindow: TimeWindow) => {
      const nextBucket = getFallbackBucketForWindow(nextWindow, bucket);
      setWindowState(nextWindow);
      if (nextBucket !== bucket) {
        setBucketState(nextBucket);
      }
      setTo(new Date());
      syncQuery(nextWindow, nextBucket);
    },
    [bucket, syncQuery]
  );

  const setBucket = useCallback(
    (nextBucket: TimeBucket) => {
      const resolvedBucket = getFallbackBucketForWindow(window, nextBucket);
      setBucketState(resolvedBucket);
      setTo(new Date());
      syncQuery(window, resolvedBucket);
    },
    [window, syncQuery]
  );

  const value = useMemo(
    () => ({
      window,
      bucket,
      bucketLabel: bucket,
      bucketValue: getTimeBucketSeconds(bucket),
      allowedBuckets: getAllowedBucketsForWindow(window),
      to,
      setTo,
      from: getFromDate(to, window),
      setWindow,
      setBucket
    }),
    [bucket, window, setBucket, setWindow, to]
  );

  return (
    <TimeContext.Provider value={value}>
      {children}
    </TimeContext.Provider>
  );
};

export const useTimeContext = (): TimeContextValue => {
  const context = useContext(TimeContext);

  if (!context) {
    throw new Error('useTimeContext must be used within TimeProvider');
  }

  return context;
};
