import type { ESP32Aggregate } from '@/types/esp32-data';

export type DayRegion = 'overnight' | 'morning' | 'midday' | 'evening';

export const REGION_ORDER: DayRegion[] = ['overnight', 'morning', 'midday', 'evening'];

export const REGION_LABEL: Record<DayRegion, string> = {
  overnight: 'Overnight',
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening'
};

const average = (values: Array<number | null | undefined>): number | null => {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
};

export const getDayRegionForHour = (hour: number): DayRegion => {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'overnight';
};

export const computeHourlyBaselineCurve = (aggregates: ESP32Aggregate[]) => {
  const bins = Array.from({ length: 24 }, () => ({
    temp: [] as number[],
    rh: [] as number[]
  }));

  for (const row of aggregates) {
    const hour = new Date(row.bucket_start).getHours();
    if (typeof row.temp_f_avg === 'number') bins[hour].temp.push(row.temp_f_avg);
    if (typeof row.rh_avg === 'number') bins[hour].rh.push(row.rh_avg);
  }

  const categories = Array.from({ length: 24 }, (_, hour) =>
    new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' })
  );

  return {
    categories,
    tempSeries: bins.map((bin) => {
      const v = average(bin.temp);
      return v == null ? null : Math.round(v * 10) / 10;
    }),
    rhSeries: bins.map((bin) => {
      const v = average(bin.rh);
      return v == null ? null : Math.round(v * 10) / 10;
    })
  };
};

export type RegionBaselineSummaryRow = {
  region: DayRegion;
  baselineTemp: number | null;
  baselineRh: number | null;
  currentTemp: number | null;
  currentRh: number | null;
  tempDelta: number | null;
  rhDelta: number | null;
};

export const computeRegionBaselineSummary = (
  currentAggregates: ESP32Aggregate[],
  baselineAggregates: ESP32Aggregate[]
): RegionBaselineSummaryRow[] => {
  const baselineRegionBuckets: Record<DayRegion, { temp: number[]; rh: number[] }> = {
    overnight: { temp: [], rh: [] },
    morning: { temp: [], rh: [] },
    midday: { temp: [], rh: [] },
    evening: { temp: [], rh: [] }
  };
  const currentRegionBuckets: Record<DayRegion, { temp: number[]; rh: number[] }> = {
    overnight: { temp: [], rh: [] },
    morning: { temp: [], rh: [] },
    midday: { temp: [], rh: [] },
    evening: { temp: [], rh: [] }
  };

  for (const row of baselineAggregates) {
    const region = getDayRegionForHour(new Date(row.bucket_start).getHours());
    if (typeof row.temp_f_avg === 'number') baselineRegionBuckets[region].temp.push(row.temp_f_avg);
    if (typeof row.rh_avg === 'number') baselineRegionBuckets[region].rh.push(row.rh_avg);
  }

  for (const row of currentAggregates) {
    const region = getDayRegionForHour(new Date(row.bucket_start).getHours());
    if (typeof row.temp_f_avg === 'number') currentRegionBuckets[region].temp.push(row.temp_f_avg);
    if (typeof row.rh_avg === 'number') currentRegionBuckets[region].rh.push(row.rh_avg);
  }

  return REGION_ORDER.map((region) => {
    const baselineTemp = average(baselineRegionBuckets[region].temp);
    const baselineRh = average(baselineRegionBuckets[region].rh);
    const currentTemp = average(currentRegionBuckets[region].temp);
    const currentRh = average(currentRegionBuckets[region].rh);

    const tempDelta =
      baselineTemp != null && currentTemp != null ? currentTemp - baselineTemp : null;
    const rhDelta =
      baselineRh != null && currentRh != null ? currentRh - baselineRh : null;

    return {
      region,
      baselineTemp,
      baselineRh,
      currentTemp,
      currentRh,
      tempDelta,
      rhDelta
    };
  });
};
