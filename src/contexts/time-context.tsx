import type { FC, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { subDays, subHours, subMinutes } from 'date-fns';
import { useRouter } from 'next/router';

export type TimePreset = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';
export type TimeBucket = '2s' | '10s' | '1m' | '5m' | '1h';

const DEFAULT_PRESET: TimePreset = '1h';
const DEFAULT_BUCKET: TimeBucket = '1m';

const PRESETS: TimePreset[] = ['15m', '1h', '6h', '24h', '7d', '30d'];
const BUCKETS: TimeBucket[] = ['2s', '10s', '1m', '5m', '1h'];

export const formatTimePresetLabel = (preset: TimePreset): string => {
  switch (preset) {
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

interface TimeContextValue {
  preset: TimePreset;
  bucket: TimeBucket;
  from: Date;
  to: Date;
  setPreset: (preset: TimePreset) => void;
  setBucket: (bucket: TimeBucket) => void;
}

const TimeContext = createContext<TimeContextValue | undefined>(undefined);

const getFromDate = (to: Date, preset: TimePreset): Date => {
  switch (preset) {
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

const asPreset = (value: string | string[] | undefined): TimePreset | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return PRESETS.includes(value as TimePreset) ? (value as TimePreset) : undefined;
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
  const [preset, setPresetState] = useState<TimePreset>(DEFAULT_PRESET);
  const [bucket, setBucketState] = useState<TimeBucket>(DEFAULT_BUCKET);
  const [to, setTo] = useState<Date>(new Date());

  useEffect(() => {
    setTo(new Date());
  }, [preset, bucket]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const queryPreset = asPreset(router.query.tcPreset);
    const queryBucket = asBucket(router.query.tcBucket);

    if (queryPreset) {
      setPresetState(queryPreset);
    }

    if (queryBucket) {
      setBucketState(queryBucket);
    }
  }, [router.isReady, router.query.tcBucket, router.query.tcPreset]);

  const syncQuery = useCallback(
    (nextPreset: TimePreset, nextBucket: TimeBucket) => {
      const nextQuery = {
        ...router.query,
        tcPreset: nextPreset,
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

  const setPreset = useCallback(
    (nextPreset: TimePreset) => {
      setPresetState(nextPreset);
      syncQuery(nextPreset, bucket);
    },
    [bucket, syncQuery]
  );

  const setBucket = useCallback(
    (nextBucket: TimeBucket) => {
      setBucketState(nextBucket);
      syncQuery(preset, nextBucket);
    },
    [preset, syncQuery]
  );

  const value = useMemo(
    () => ({
      preset,
      bucket,
      to,
      from: getFromDate(to, preset),
      setPreset,
      setBucket
    }),
    [bucket, preset, setBucket, setPreset, to]
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
