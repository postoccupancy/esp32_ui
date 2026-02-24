import type { FC, ReactNode } from 'react';
import type { ApexOptions } from 'apexcharts';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Chart } from '../../../components/chart';
import { formatTimeWindowLabel, useTimeContext } from '../../../contexts/time-context';

const now = new Date();

const createCategories = (): string[] => {
  const categories: string[] = [];

  for (let i = 12; i >= 0; i--) {
    categories.push(format(subDays(now, i), 'dd MMM'));
  }

  return categories;
};

// added this helper to calculate min/max for y-axis based on data, with some padding
const getSeriesRange = (data: (number | null)[]) => {
  const values = data.filter((v): v is number => typeof v === 'number');
  if (!values.length) return { min: 0, max: 1 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.1; // 10% padding

  return {
    min: min - pad,
    max: max + pad,
  };
};




const useChartOptions = (
  leftRange: { min: number; max: number }, 
  rightRange: { min: number; max: number },
  tooltipCategories?: string[],
  xAxisLabels?: string[],
): ApexOptions => {
  const theme = useTheme();
  if (!tooltipCategories) tooltipCategories = createCategories();
  const axisCategories = xAxisLabels && xAxisLabels.length ? xAxisLabels : tooltipCategories;

  return {
    chart: {
      background: 'transparent',
      stacked: false,
      toolbar: {
        show: false
      },
      zoom: {
        enabled: false
      }
    },
    colors: [
      theme.palette.primary.main,
      theme.palette.warning.main
    ],
    dataLabels: {
      enabled: false
    },
    fill: {
      opacity: 1,
      type: 'solid'
    },
    grid: {
      borderColor: theme.palette.divider,
      strokeDashArray: 2,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    legend: {
      horizontalAlign: 'right',
      labels: {
        colors: theme.palette.text.secondary
      },
      position: 'top',
      show: true
    },
    markers: {
      hover: {
        size: undefined,
        sizeOffset: 2
      },
      radius: 2,
      shape: 'circle',
      size: 1,
      strokeWidth: 0
    },
    stroke: {
      curve: 'smooth',
      dashArray: [0, 3],
      lineCap: 'butt',
      width: 3
    },
    theme: {
      mode: theme.palette.mode
    },
    tooltip: {
      x: {
        formatter: (value: number, opts?: { dataPointIndex?: number }) => {
          const i = opts?.dataPointIndex;
          if (
            typeof i === 'number' &&
            tooltipCategories &&
            i >= 0 &&
            i < tooltipCategories.length
          ) {
            return tooltipCategories[i];
          }
          return String(value);
        }
      }
    },
    xaxis: {
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      categories: axisCategories,
      labels: {
        show: true,
        rotate: 0,
        hideOverlappingLabels: true,
      }
    },
    yaxis: [
      {
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        },
        labels: {
          show: false
        },
        min: leftRange.min,
        max: leftRange.max,
        forceNiceScale: true,
      },
      {
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        },
        labels: {
          show: false
        },
        min: rightRange.min,
        max: rightRange.max,
        forceNiceScale: true,
      }
    ]
  };
};

type ChartSeries = {
  name: string;
  data: (number | null)[];
}[];

interface EcommerceSalesRevenueProps {
  chartSeries: ChartSeries;
  title?: string & ReactNode;
  tooltipCategories?: string[];
  xAxisLabels?: string[];
}

export const EcommerceSalesRevenue: FC<EcommerceSalesRevenueProps> = (props) => {
  const { chartSeries, tooltipCategories, xAxisLabels } = props;
  const { window } = useTimeContext();

  const title = props.title || formatTimeWindowLabel(window);

  const leftRange = getSeriesRange(chartSeries[0]?.data ?? []);
  const rightRange = getSeriesRange(chartSeries[1]?.data ?? []);
  const chartOptions = useChartOptions(leftRange, rightRange, tooltipCategories, xAxisLabels);


  return (
    <Card>
      <CardHeader title={title} />
      <CardContent sx={{ pt: 0 }}>
        <Chart
          height={320}
          options={chartOptions}
          series={chartSeries}
          type="line"
        />
      </CardContent>
    </Card>
  );
};
