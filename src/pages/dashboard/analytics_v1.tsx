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

const Page: NextPage = () => {
  const settings = useSettings();
  const { from, to, bucket } = useTimeContext();

  usePageView();

  return (
    <>
      <Head>
        <title>
          Dashboard: Analytics | Devias Kit PRO
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
                    Analytics
                  </Typography>
                  <Chip
                    label={`${format(from, 'MMM d, HH:mm')} - ${format(to, 'MMM d, HH:mm')} (${bucket})`}
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
                  {/* <Button
                    startIcon={(
                      <SvgIcon>
                        <PlusIcon />
                      </SvgIcon>
                    )}
                    variant="contained"
                  >
                    New Dashboard
                  </Button> */}
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
