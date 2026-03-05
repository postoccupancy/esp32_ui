import { ESP32AggregateSeriesKey } from "@/pages/dashboard";
import { ESP32Aggregate } from "@/types/esp32-data";

type MetricSummary = {
    withinThresholdSeries: number[];
    withinThresholdPct: number;
    madSeries: number[];
    madValue: number;
    completenessSeries: number[];
    completenessValue: number;
    breachSeries: number[];
    breachTotal: number;
    tempMean: number;
    tempMax: number;
    tempMin: number;
    rhMean: number;
    rhMax: number;
    rhMin: number;
};

const THRESHOLD = 0.1

const round = (value: number | null | undefined, decimals = 1) => {
if (value == null) return null;
const factor = 10 ** decimals;
return Math.round(value * factor) / factor;
};

export const computeMetricsSummary = (aggregates: ESP32Aggregate[], bucketValue: number): MetricSummary => {
    const getNumericSeries = (key: ESP32AggregateSeriesKey) => {
      return aggregates.map((agg) => agg[key])
        .filter((v): v is number => typeof v === 'number');
    };

    const tempValues = getNumericSeries('temp_f_avg');
    const rhValues = getNumericSeries('rh_avg');

    const mean = (values: number[]) =>
      values.reduce((sum, v) => sum + v, 0) / values.length;

    const tempMean = mean(tempValues);
    const rhMean = mean(rhValues);
    const tempMax = Math.max(...tempValues);
    const tempMin = Math.min(...tempValues);
    const rhMax = Math.max(...rhValues);
    const rhMin = Math.min(...rhValues);

    const withinThresholdSeries = aggregates.map((agg) => {
      const temp = agg.temp_f_avg;
      const rh = agg.rh_avg;
      const tempOk =
        typeof temp === 'number' &&
        typeof tempMean === 'number' &&
        Math.abs(temp - tempMean) <= Math.abs(tempMean) * THRESHOLD;
      const rhOk =
        typeof rh === 'number' &&
        typeof rhMean === 'number' &&
        Math.abs(rh - rhMean) <= Math.abs(rhMean) * THRESHOLD;
      return tempOk && rhOk ? 100 : 0;
    });

    const withinThresholdPct = withinThresholdSeries.length
      ? Math.round(
          withinThresholdSeries.reduce<number>((sum, v) => sum + (v > 0 ? 1 : 0), 0) /
            withinThresholdSeries.length *
            100
        )
      : 0;

    const madSeries = aggregates.map((agg) => {
      const deviations: number[] = [];
      if (typeof agg.temp_f_avg === 'number' && typeof tempMean === 'number' && tempMean !== 0) {
        deviations.push(Math.abs((agg.temp_f_avg - tempMean) / tempMean) * 100);
      }
      if (typeof agg.rh_avg === 'number' && typeof rhMean === 'number' && rhMean !== 0) {
        deviations.push(Math.abs((agg.rh_avg - rhMean) / rhMean) * 100);
      }
      if (!deviations.length) return 0;
      return round(deviations.reduce((sum, v) => sum + v, 0) / deviations.length, 1) ?? 0;
    });

    const madValue = madSeries.length
      ? round(madSeries.reduce((sum, v) => sum + v, 0) / madSeries.length, 1) ?? 0
      : 0;

    const expectedPerBucket = Math.max(1, Math.round(bucketValue / 2));
    const completenessSeries = aggregates.map((agg) => {
      const pct = (agg.count / expectedPerBucket) * 100;
      return Math.max(0, Math.min(100, round(pct, 1) ?? 0));
    });
    const completenessValue = completenessSeries.length
      ? Math.round(
          completenessSeries.reduce((sum, v) => sum + v, 0) / completenessSeries.length
        )
      : 0;

    const breachSeries = aggregates.map((agg) => {
      let breaches = 0;
      if (
        typeof agg.temp_f_avg === 'number' &&
        typeof tempMean === 'number' &&
        Math.abs(agg.temp_f_avg - tempMean) > Math.abs(tempMean) * 0.1
      ) {
        breaches += 1;
      }
      if (
        typeof agg.rh_avg === 'number' &&
        typeof rhMean === 'number' &&
        Math.abs(agg.rh_avg - rhMean) > Math.abs(rhMean) * 0.1
      ) {
        breaches += 1;
      }
      return breaches;
    });
    const breachTotal = breachSeries.reduce((sum, v) => sum + v, 0);

    return {
      withinThresholdSeries,
      withinThresholdPct,
      madSeries,
      madValue,
      completenessSeries,
      completenessValue,
      breachSeries,
      breachTotal,
      tempMean,
      tempMax,
      tempMin,
      rhMean,
      rhMax,
      rhMin
    };
  };