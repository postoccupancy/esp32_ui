import { format } from 'date-fns';
import type { TimeWindow } from '@/contexts/time-context';

export const buildSparseTimeAxisLabels = (
  bucketStarts: string[],
  window: TimeWindow
): string[] => {
  return bucketStarts.map((iso) => {
    const d = new Date(iso);

    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    const day = d.getDay(); // 0 = Sunday

    const isMidnight = h === 0 && m === 0 && s === 0;

    switch (window) {
      case '30d':
        // Sunday midnight -> "Feb 23"
        if (isMidnight && day === 0) {
          return format(d, 'MMM d');
        }
        return '';

      case '7d':
        // Every day at midnight -> "Sun Feb 23"
        if (isMidnight) {
          return format(d, 'EEE MMM d');
        }
        return '';

      case '24h':
        // Every 2 hours -> "3 PM"
        if (m === 0 && s === 0 && h % 2 === 0) {
          return format(d, 'h a');
        }
        return '';

      case '6h':
        // Every 30 minutes -> "3:30 PM"
        if (s === 0 && (m === 0 || m === 30)) {
          return format(d, 'h:mm a');
        }
        return '';

      case '1h':
        // Every 10 minutes -> "3:10 PM"
        if (s === 0 && m % 10 === 0) {
          return format(d, 'h:mm a');
        }
        return '';

      case '15m':
        // Every minute -> "3:01 PM"
        if (s === 0) {
          return format(d, 'h:mm a');
        }
        return '';

      default:
        return '';
    }
  });
};
