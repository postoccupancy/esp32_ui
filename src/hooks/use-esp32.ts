import { useQuery } from "@tanstack/react-query";

import { ESP32Reading, ESP32Aggregate, ESP32Snapshot } from "@/types/esp32-data";
import { constructUrl } from "@/utils/dataHelpers";

const baseUrl = process.env.NEXT_PUBLIC_ESP32_API_BASE_URL || "http://localhost:8000";
const token = process.env.NEXT_PUBLIC_API_TOKEN || "a-long-secret-key";

// RAW TABLE DATA

type ESP32Response = {
  ok: true;
  readings?: ESP32Reading[];
  snapshots?: ESP32Snapshot[];
};

type UseESP32BaseOptions = {
  device_id?: string;
  start_ts?: string;
  end_ts?: string;
  limit?: number;
  offset?: number;
  order_desc?: boolean;
};

type UseESP32Options = UseESP32BaseOptions & {
  table?: "readings" | "snapshots";
};


export function useESP32(options: UseESP32Options = {}) {
  const endpoint = `${baseUrl}/timeseries`;

  const params = { token, ...options };

  console.log("constructURL: ", constructUrl(endpoint, params));

  const fetchData = async (): Promise<ESP32Response> => {
    const response = await fetch(constructUrl(endpoint, params));
    if (!response.ok) {
      throw new Error("Network response from URL was not ok");
    }
    return response.json() as Promise<ESP32Response>;
  };

  const { data, isSuccess, error } = useQuery({
    queryKey: ["esp32", params],
    queryFn: fetchData,
    refetchInterval: 60000, // Refetch every 1 minute for real-time updates
    refetchIntervalInBackground: true, // Continue refetching even when the tab is in the background
  });
  return { data, isSuccess, error };
}


// AGGREGATES

type ESP32AggregateResponse = {
  ok: true;
  bucket: number;
  aggregates: ESP32Aggregate[];
};

type UseESP32AggregatesOptions = UseESP32BaseOptions & {
  bucket: number;
  table?: "readings";
  aggregate_mode?: "full" | "lite";
};

type UseESP32QueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  refetchIntervalInBackground?: boolean;
};


export function useESP32Aggregates(
  options: UseESP32AggregatesOptions,
  queryOptions: UseESP32QueryOptions = {}
) {
  const endpoint = `${baseUrl}/timeseries`;
  const params = { token, ...options };

  const fetchAggregates = async (): Promise<ESP32AggregateResponse> => {
    const response = await fetch(constructUrl(endpoint, params));
    if (!response.ok) {
      throw new Error("Network response from URL was not ok");
    }
    return response.json() as Promise<ESP32AggregateResponse>;
  };

  const { data, isSuccess, error } = useQuery({
    queryKey: ["esp32-aggregates", params],
    queryFn: fetchAggregates,
    enabled: queryOptions.enabled,
    staleTime: queryOptions.staleTime,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground,
  });

  return { data, isSuccess, error };
}


// SUMMARY METRICS

type ESP32Summary = {
  first_ts: string | null;
  last_ts: string | null;
  count: number;
  temp_c_avg: number | null;
  temp_f_avg: number | null;
  temp_f_min: number | null;
  temp_f_max: number | null;
  rh_avg: number | null;
  rh_min: number | null;
  rh_max: number | null;
};

type ESP32SummaryResponse = {
  ok: true;
  summary: ESP32Summary;
};

type UseESP32SummaryOptions = Pick<UseESP32BaseOptions, "device_id" | "start_ts" | "end_ts"> & {
  table?: "readings";
};

export function useESP32Summary(
  options: UseESP32SummaryOptions = {},
  queryOptions: UseESP32QueryOptions = {}
) {
  const endpoint = `${baseUrl}/timeseries/summary`;
  const params = { token, ...options };

  const fetchSummary = async (): Promise<ESP32SummaryResponse> => {
    const response = await fetch(constructUrl(endpoint, params));
    if (!response.ok) {
      throw new Error("Network response from URL was not ok");
    }
    return response.json() as Promise<ESP32SummaryResponse>;
  };

  const { data, isSuccess, error } = useQuery({
    queryKey: ["esp32-summary", params],
    queryFn: fetchSummary,
    enabled: queryOptions.enabled,
    staleTime: queryOptions.staleTime,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground,
  });

  return { data, isSuccess, error };
}

// OUTDOOR WEATHER (NWS, via esp32_api)

type ESP32WeatherHourlyRow = {
  bucket_start: string;
  bucket_end: string;
  count: number;
  temp_c_avg: number | null;
  temp_c_min: number | null;
  temp_c_max: number | null;
  rh_avg: number | null;
  rh_min: number | null;
  rh_max: number | null;
  dewpoint_c_avg: number | null;
  dewpoint_c_min: number | null;
  dewpoint_c_max: number | null;
  wind_m_s_avg: number | null;
  wind_m_s_min: number | null;
  wind_m_s_max: number | null;
};

type ESP32WeatherHourlyResponse = {
  ok: true;
  provider: "noaa" | "openmeteo";
  station?: string | null;
  latitude?: number;
  longitude?: number;
  timezone: string;
  start_ts: string;
  end_ts: string;
  rows: ESP32WeatherHourlyRow[];
};

type UseWeatherHourlyOptions = {
  provider?: "noaa" | "openmeteo";
  station?: string;
  latitude?: number;
  longitude?: number;
  start_ts?: string;
  end_ts?: string;
  tz?: string;
  page_limit?: number;
  max_pages?: number;
};

export function useWeatherHourly(
  options: UseWeatherHourlyOptions = {},
  queryOptions: UseESP32QueryOptions = {}
) {
  const endpoint = `${baseUrl}/weather/hourly`;
  const params = { token, ...options };

  const fetchWeather = async (): Promise<ESP32WeatherHourlyResponse> => {
    const response = await fetch(constructUrl(endpoint, params));
    if (!response.ok) {
      throw new Error("Network response from weather URL was not ok");
    }
    return response.json() as Promise<ESP32WeatherHourlyResponse>;
  };

  const { data, isSuccess, error } = useQuery({
    queryKey: ["esp32-weather-hourly", params],
    queryFn: fetchWeather,
    enabled: queryOptions.enabled,
    staleTime: queryOptions.staleTime,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground,
  });

  return { data, isSuccess, error };
}
