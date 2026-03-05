export type ESP32Reading = {
  ts: string;
  device_id: string;
  temp_c?: number | null;
  temp_f?: number | null;
  rh?: number | null;
  [key: string]: unknown; // Index signature to allow for additional fields without TypeScript errors
};

export type ESP32Snapshot = {
  device_id: string;
  window_start: string;
  window_end: string;
  snapshot_text: string;
}

export type ESP32Aggregate = {
  bucket_start: string;
  bucket_end: string;
  first_ts: string;
  last_ts: string;
  count: number;
  temp_c_avg?: number | null;
  temp_c_min?: number | null;
  temp_c_max?: number | null;
  temp_f_avg?: number | null;
  temp_f_min?: number | null;
  temp_f_max?: number | null;
  rh_avg?: number | null;
  rh_min?: number | null;
  rh_max?: number | null;
  [key: string]: unknown; // Index signature to allow for additional fields without TypeScript errors
};
