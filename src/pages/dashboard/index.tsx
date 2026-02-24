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
  Unstable_Grid2 as Grid
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

type ESP32AggregateSeriesKey =
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
  usePageView();

  const { from, to, bucketLabel, bucketValue, window } = useTimeContext();
  const windowDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);

  const { data } = useESP32Aggregates({
    start_ts: from.toISOString(), 
    // end_ts: to.toISOString(),
    bucket: bucketValue,  
    order_desc: false,
    limit: 1000,
  });
  const aggregates = useMemo(() => data?.aggregates || [], [data]);

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
                <Stack spacing={1}>
                  <Typography variant="h4">
                    Overview
                  </Typography>
                  <Chip
                    label={`${format(from, 'MMM d, HH:mm')} - ${format(to, 'MMM d, HH:mm')} (${bucketLabel})`}
                    size="small"
                    sx={{ width: 'fit-content' }}
                    variant="outlined"
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
                    data: [0, 170, 242, 98, 63, 56, 85, 171, 209, 163, 204, 21, 264, 0]
                  }
                ]}
                title="% Time within Thresholds"
                value="98%"
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
                    data: [0, 245, 290, 187, 172, 106, 15, 210, 202, 19, 18, 3, 212, 0]
                  }
                ]}
                title="Mean Absolute Deviation"
                value="14.4"
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
                    data: [0, 277, 191, 93, 92, 85, 166, 240, 63, 4, 296, 144, 166, 0]
                  }
                ]}
                title="Data Completeness"
                value="92%"
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
                    data: [0, 277, 191, 93, 92, 85, 166, 240, 63, 4, 296, 144, 166, 0]
                  }
                ]}
                title="Threshold Breaches"
                value="12"
              />
              
            </Grid>
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
              lg={4}
            >
              <EcommerceSalesRevenue
                title="Scatter Plot: temperature vs humidity"
                chartSeries={[
                  {
                    name: 'Temperature (°F)',
                    data: [3350, 1840, 2254, 5780, 9349, 5241, 2770, 2051, 3764, 2385, 5912, 8323]
                  },
                  {
                    name: 'Relative Humidity (%)',
                    data: [35, 41, 62, 42, 13, 18, 29, 37, 36, 51, 32, 35]
                  }
                ]}
              />
            </Grid>
            <Grid
              xs={12}
              lg={4}
            >
              <EcommerceSalesRevenue
                title="Histogram: temperature/humidity distribution"
                chartSeries={[
                  {
                    name: 'Temperature (°F)',
                    data: [3350, 1840, 2254, 5780, 9349, 5241, 2770, 2051, 3764, 2385, 5912, 8323]
                  },
                  {
                    name: 'Relative Humidity (%)',
                    data: [35, 41, 62, 42, 13, 18, 29, 37, 36, 51, 32, 35]
                  }
                ]}
              />
            </Grid>
            <Grid
              xs={12}
              lg={4}
            >
              <EcommerceSalesRevenue
                title="Heatmap: temperature vs humidity over time"
                chartSeries={[
                  {
                    name: 'Temperature (°F)',
                    data: [3350, 1840, 2254, 5780, 9349, 5241, 2770, 2051, 3764, 2385, 5912, 8323]
                  },
                  {
                    name: 'Relative Humidity (%)',
                    data: [35, 41, 62, 42, 13, 18, 29, 37, 36, 51, 32, 35]
                  }
                ]}
              />            
            </Grid>

            <Grid
              xs={12}
              md={12}
            > 
              <EcommerceStats
                average={69}
                max={72}
                min={64}
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
