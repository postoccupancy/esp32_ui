export type AlertCategory = 'environment' | 'system' | 'temp' | 'rh' | 'both';
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'slight' | 'moderate' | 'extreme';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'short' | 'sustained';

export interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  locationId: string;
  locationName: string;
  sensorId?: string;
  threshold?: string;
  value?: number;
  unit?: string;
  createdAt: number;
  startAt?: number;
  endAt?: number;
  isActive?: boolean;
  acknowledgedAt?: number;
  resolvedAt?: number;
  preview?: {
    categories: string[];
    timestamps?: string[];
    thresholdPct?: number;
    temp: {
      values: Array<number | null>;
      baselines: Array<number | null>;
      highlight: Array<number | null>;
    };
    rh: {
      values: Array<number | null>;
      baselines: Array<number | null>;
      highlight: Array<number | null>;
    };
  };
}
