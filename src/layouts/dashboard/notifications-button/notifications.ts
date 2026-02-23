import { alerts } from '../../../api/alerts/data';

export interface Notification {
  alertId: string;
  category: 'environment' | 'system';
  id: string;
  createdAt: number;
  description: string;
  read?: boolean;
  title: string;
  type: 'environment' | 'system';
}

const toNotification = (alertIndex: number): Notification => {
  const alert = alerts[alertIndex];

  return {
    alertId: alert.id,
    category: alert.category,
    id: alert.id,
    createdAt: alert.createdAt,
    description: `${alert.locationName}${alert.sensorId ? ` (${alert.sensorId})` : ''}`,
    read: alert.status !== 'open',
    title: alert.title,
    type: alert.category
  };
};

export const notifications: Notification[] = [
  toNotification(0),
  toNotification(2),
  toNotification(1),
  toNotification(7),
  toNotification(6)
];
