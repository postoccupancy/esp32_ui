import { subHours, subMinutes } from 'date-fns';
import type { Alert } from '../../types/alert';

const now = new Date();

export const alerts: Alert[] = [
  {
    id: 'alrt-001',
    category: 'environment',
    severity: 'critical',
    status: 'open',
    title: 'High temperature spike',
    description: 'Temperature exceeded configured ceiling at Warehouse A.',
    locationId: 'loc-warehouse-a',
    locationName: 'Warehouse A',
    sensorId: 'esp32-01',
    threshold: '> 84.0 F',
    value: 87.6,
    unit: 'F',
    createdAt: subMinutes(now, 8).getTime()
  },
  {
    id: 'alrt-002',
    category: 'environment',
    severity: 'warning',
    status: 'open',
    title: 'Low humidity window',
    description: 'Humidity remained below threshold for 12 minutes.',
    locationId: 'loc-greenhouse-2',
    locationName: 'Greenhouse 2',
    sensorId: 'esp32-07',
    threshold: '< 25%',
    value: 22.4,
    unit: '%',
    createdAt: subMinutes(now, 17).getTime()
  },
  {
    id: 'alrt-003',
    category: 'system',
    severity: 'critical',
    status: 'open',
    title: 'Sensor offline',
    description: 'No readings received from sensor for 5+ minutes.',
    locationId: 'loc-roof-west',
    locationName: 'Roof West',
    sensorId: 'esp32-03',
    createdAt: subMinutes(now, 11).getTime()
  },
  {
    id: 'alrt-004',
    category: 'system',
    severity: 'warning',
    status: 'acknowledged',
    title: 'Delayed ingestion',
    description: 'Data arrival cadence dropped below expected 2-second interval.',
    locationId: 'loc-basement',
    locationName: 'Basement',
    sensorId: 'esp32-12',
    createdAt: subMinutes(now, 42).getTime(),
    acknowledgedAt: subMinutes(now, 20).getTime()
  },
  {
    id: 'alrt-005',
    category: 'environment',
    severity: 'info',
    status: 'resolved',
    title: 'Threshold breach episode ended',
    description: 'Temperature returned to normal band after 26 minutes.',
    locationId: 'loc-office',
    locationName: 'Office',
    sensorId: 'esp32-02',
    threshold: '> 80.0 F',
    value: 79.1,
    unit: 'F',
    createdAt: subHours(now, 5).getTime(),
    resolvedAt: subHours(now, 4).getTime()
  },
  {
    id: 'alrt-006',
    category: 'system',
    severity: 'warning',
    status: 'resolved',
    title: 'Packet loss detected',
    description: 'Short packet loss burst observed and auto-recovered.',
    locationId: 'loc-garage',
    locationName: 'Garage',
    sensorId: 'esp32-09',
    createdAt: subHours(now, 8).getTime(),
    resolvedAt: subHours(now, 7).getTime()
  },
  {
    id: 'alrt-007',
    category: 'environment',
    severity: 'critical',
    status: 'acknowledged',
    title: 'Rapid temperature change',
    description: 'Temperature changed by 7.2 F within 4 minutes.',
    locationId: 'loc-lab',
    locationName: 'Lab',
    sensorId: 'esp32-04',
    value: 7.2,
    unit: 'F/4m',
    createdAt: subMinutes(now, 33).getTime(),
    acknowledgedAt: subMinutes(now, 18).getTime()
  },
  {
    id: 'alrt-008',
    category: 'system',
    severity: 'info',
    status: 'open',
    title: 'Sensor recovered',
    description: 'Sensor stream resumed after transient disconnect.',
    locationId: 'loc-roof-east',
    locationName: 'Roof East',
    sensorId: 'esp32-08',
    createdAt: subMinutes(now, 6).getTime()
  }
];
