export type AlertCategory = 'environment' | 'system';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

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
  acknowledgedAt?: number;
  resolvedAt?: number;
}
