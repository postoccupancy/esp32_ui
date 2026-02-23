import type { Alert, AlertCategory, AlertStatus, AlertSeverity } from '../../types/alert';
import { deepCopy } from '../../utils/deep-copy';
import { alerts } from './data';

type GetAlertsRequest = {
  category?: AlertCategory;
  status?: AlertStatus;
  severity?: AlertSeverity;
  locationId?: string;
};

type GetAlertsResponse = Promise<{
  data: Alert[];
  count: number;
}>;

class AlertsApi {
  getAlerts(request: GetAlertsRequest = {}): GetAlertsResponse {
    const { category, status, severity, locationId } = request;

    let data = deepCopy(alerts) as Alert[];

    if (category) {
      data = data.filter((alert) => alert.category === category);
    }

    if (status) {
      data = data.filter((alert) => alert.status === status);
    }

    if (severity) {
      data = data.filter((alert) => alert.severity === severity);
    }

    if (locationId) {
      data = data.filter((alert) => alert.locationId === locationId);
    }

    data.sort((a, b) => b.createdAt - a.createdAt);

    return Promise.resolve({
      data,
      count: data.length
    });
  }
}

export const alertsApi = new AlertsApi();
