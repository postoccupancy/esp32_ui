import { useQuery } from "@tanstack/react-query";

import { ESP32Reading, ESP32Aggregate, ESP32Snapshot } from "@/types/esp32";
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
};


export function useESP32Aggregates(options: UseESP32AggregatesOptions) {
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
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  return { data, isSuccess, error };
}
