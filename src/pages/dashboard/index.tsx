import type { NextPage } from 'next';
import Head from 'next/head';
import PlusIcon from '@untitled-ui/icons-react/build/esm/Plus';
import {
  Box,
  Button,
  Chip,
  Container,
  Stack,
  SvgIcon,
  Typography,
  Unstable_Grid2 as Grid,
  useTheme
} from '@mui/material';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { TimeContextControls } from '../../components/time-context-controls';
import { useTimeContext } from '../../contexts/time-context';
import { AnalyticsStats } from '../../sections/dashboard/analytics/analytics-stats';
import { AnalyticsMostVisited } from '../../sections/dashboard/analytics/analytics-most-visited';
import { AnalyticsSocialSources } from '../../sections/dashboard/analytics/analytics-social-sources';
import { AnalyticsTrafficSources } from '../../sections/dashboard/analytics/analytics-traffic-sources';
import { AnalyticsVisitsByCountry } from '../../sections/dashboard/analytics/analytics-visits-by-country';
import ArrowRightIcon from '@untitled-ui/icons-react/build/esm/ArrowRight';
import { EcommerceSalesRevenue } from 'src/sections/dashboard/ecommerce/ecommerce-sales-revenue';
import { EcommerceStats } from 'src/sections/dashboard/ecommerce/ecommerce-stats';
import { useESP32Aggregates } from '@/hooks/use-esp32';
import { buildSparseTimeAxisLabels } from '@/utils/chart-utils';
import { get } from 'lodash';
import { CryptoWallet } from '@/sections/dashboard/crypto/crypto-wallet';
import { MetricCard } from '@/sections/dashboard/temperature/metric-card';
import { computeMetricsSummary } from '@/sections/dashboard/temperature/compute-metrics-summary';

export type ESP32AggregateSeriesKey =
  | 'temp_c_avg'
  | 'temp_c_min'
  | 'temp_c_max'
  | 'temp_f_avg'
  | 'temp_f_min'
  | 'temp_f_max'
  | 'rh_avg'
  | 'rh_min'
  | 'rh_max';



const Page: NextPage = () => {
  const settings = useSettings();
  const theme = useTheme();
  usePageView();

  const { from, to, bucketLabel, bucketValue, window } = useTimeContext();
  const windowMS = to.getTime() - from.getTime();
  const windowDays = windowMS / (1000 * 60 * 60 * 24);

  const { data } = useESP32Aggregates({
    start_ts: from.toISOString(), 
    // end_ts: to.toISOString(),
    bucket: bucketValue,  
    order_desc: false,
    limit: 1000,
  });
  const aggregates = useMemo(() => data?.aggregates || [], [data]);


  // For comparison, fetch the previous window's aggregates
  const prevTo = useMemo(() => new Date(from.getTime()), [from]);
  const prevFrom = useMemo(() => new Date(from.getTime() - windowMS), [from, windowMS]);

  const { data: prevData } = useESP32Aggregates({
    start_ts: prevFrom.toISOString(),
    end_ts: prevTo.toISOString(),
    bucket: bucketValue,
    order_desc: false,
    limit: 1000,
  });
  const prevAggregates = useMemo(() => prevData?.aggregates ?? [], [prevData]);


  const tooltipCategories = useMemo(() => {
    return aggregates.map((agg) => {
      const d = new Date(agg.bucket_start);
      return d.toLocaleTimeString([], {
        weekday: windowDays > 1 ? 'short' : undefined,
        month: windowDays > 1 ? 'short' : undefined,
        day: windowDays > 1 ? 'numeric' : undefined,
        hour: 'numeric',
        minute: bucketValue < 3600 ? '2-digit' : undefined,
        second: bucketValue < 60 ? '2-digit' : undefined,
      });
    });
  }, [aggregates, windowDays, bucketValue]);

  const bucketStarts = useMemo(
    () => aggregates.map((agg) => agg.bucket_start),
    [aggregates]
  );

  const xAxisLabels = useMemo(
    () => buildSparseTimeAxisLabels(bucketStarts, window),
    [bucketStarts, window]
  );
  
  const round = (value: number | null | undefined, decimals = 1) => {
    if (value == null) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };


  const getSeries = (key: ESP32AggregateSeriesKey) => {
    return aggregates.map((agg) => round(agg[key] as number | null | undefined));
  };

  

  const analyticsMetrics = useMemo(() => {
    return computeMetricsSummary(aggregates, bucketValue);
  }, [aggregates, bucketValue]);

  const previousMetrics = useMemo(() => {
    return computeMetricsSummary(prevAggregates, bucketValue);
  }, [prevAggregates, bucketValue]);


  const percentChange = (current: number, previous: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) {
    if (current === 0) return 0;
    return 100; // or return 0 if you prefer to avoid spikes on zero baseline
  }
    return Math.round(((current - previous) / previous) * 1000) / 10; // 1 decimal
  };


  const tempRate = percentChange(analyticsMetrics.tempMean, previousMetrics.tempMean);
  const rhRate = percentChange(analyticsMetrics.rhMean, previousMetrics.rhMean);
  const completenessRate = percentChange(analyticsMetrics.completenessValue, previousMetrics.completenessValue);
  const breachRate = percentChange(analyticsMetrics.breachTotal, previousMetrics.breachTotal);



  return (
    <>
      <Head>
        <title>
          Dashboard: Overview | Devias Kit PRO
        </title>
      </Head>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          py: 8
        }}
      >
        <Container maxWidth={settings.stretch ? false : 'xl'}>
          <Grid
            container
            spacing={{
              xs: 3,
              lg: 4
            }}
          >
            <Grid xs={12}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                spacing={2}
              >
                <Stack 
                  spacing={2} 
                  direction={"row"}
                  alignItems="flex-end"
                  sx={{ mb: 1 }}
                >
                  <Typography variant="h4" 
                    sx={{ lineHeight: 1 }}>
                    Overview
                  </Typography>
                  <Chip
                    label={`${format(from, 'MMM d, HH:mm')} - ${format(to, 'MMM d, HH:mm')} (${bucketLabel})`}
                    size="small"
                    sx={{ width: 'fit-content', p: 1, display: "none" }}
                    variant="filled"
                  />
                </Stack>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                >
                  <TimeContextControls />
                </Stack>
              </Stack>
            </Grid>
            <Grid
              xs={12}
              md={12}
            >
              <Stack
                direction="row"
                spacing={3}
              >
                <MetricCard
                  chartColor={theme.palette.primary.main}
                  // chartSeries={[
                  //   {
                  //     name: 'BTC',
                  //     data: [
                  //       56, 61, 64, 60, 63, 61, 60, 68, 66, 64, 77, 60, 65, 51, 72, 80,
                  //       74, 67, 77, 83, 94, 95, 89, 100, 94, 104, 101, 105, 104, 103, 107, 120
                  //     ]
                  //   }
                  // ]}
                  mainAmount={`${analyticsMetrics.tempMean.toFixed(1)}°`}
                  mainLabel="F"
                  rate={tempRate}
                  sx={{ flexBasis: '50%' }}
                  min={`${analyticsMetrics.tempMin.toFixed(1)}°`}
                  max={`${analyticsMetrics.tempMax.toFixed(1)}°`}
                />
                <MetricCard
                  chartColor={theme.palette.info.main}
                  // chartSeries={[
                  //   {
                  //     name: 'ETH',
                  //     data: [
                  //       65, 64, 32, 45, 54, 76, 82, 80, 85, 78, 82, 95, 93, 80, 112, 102,
                  //       105, 95, 98, 102, 104, 99, 101, 100, 109, 106, 111, 105, 108, 112, 108, 111
                  //     ]
                  //   }
                  // ]}
                  mainAmount={`${analyticsMetrics.rhMean.toFixed(1)}%`}
                  mainLabel="RH"
                  rate={rhRate}
                  sx={{ flexBasis: '50%' }}
                  min={`${analyticsMetrics.rhMin.toFixed(1)}%`}
                  max={`${analyticsMetrics.rhMax.toFixed(1)}%`}
                />
              </Stack>
            </Grid>
            {/* <Grid
              xs={12}
              md={12}
            > 
              <EcommerceStats
                average={analyticsMetrics.tempMean ?? 0}
                max={analyticsMetrics.tempMax ?? 0}
                min={analyticsMetrics.tempMin ?? 0}
              />
            </Grid> */}
            
            <Grid
              xs={12}
              lg={12}
            >
              <EcommerceSalesRevenue
                chartSeries={[
                  {
                    name: 'Temperature (°F)',
                    data: getSeries('temp_f_avg') // Map aggregates to temperature average values, using null if not available
                  },
                  {
                    name: 'Relative Humidity (%)',
                    data: getSeries('rh_avg') // Map aggregates to RH average values, using null if not available
                  }
                ]}
                tooltipCategories={tooltipCategories}
                xAxisLabels={xAxisLabels}
              />
            </Grid>
            <Grid
              xs={12}
              md={3}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See sources
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.withinThresholdSeries
                  }
                ]}
                title="% Time within Thresholds"
                value={`${analyticsMetrics.withinThresholdPct}%`}
              />
            </Grid>
            <Grid
              xs={12}
              md={3}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See traffic
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.madSeries
                  }
                ]}
                title="Mean Absolute Deviation"
                value={`${analyticsMetrics.madValue}`}
              />
            </Grid>
            <Grid
              xs={12}
              md={3}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See campaigns
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.completenessSeries
                  }
                ]}
                title="Data Completeness"
                value={`${analyticsMetrics.completenessValue}%`}
              />
              
            </Grid>
            <Grid
              xs={12}
              md={3}
            >
              <AnalyticsStats
                action={(
                  <Button
                    color="inherit"
                    endIcon={(
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    )}
                    size="small"
                  >
                    See campaigns
                  </Button>
                )}
                chartSeries={[
                  {
                    data: analyticsMetrics.breachSeries
                  }
                ]}
                title="Threshold Breaches"
                value={`${analyticsMetrics.breachTotal}`}
              />
              
            </Grid>


          </Grid>
          
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) => (
  <DashboardLayout>
    {page}
  </DashboardLayout>
);

export default Page;
