import type { NextPage } from 'next';
import Head from 'next/head';
import RefreshCcw01Icon from '@untitled-ui/icons-react/build/esm/RefreshCcw01';
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
import { addDays, subDays, subHours, subMinutes } from 'date-fns';
import { format } from 'date-fns';
import { TimeContextControls } from '../../components/time-context-controls';
import { useTimeContext } from '../../contexts/time-context';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { EcommerceCostBreakdown } from '../../sections/dashboard/ecommerce/ecommerce-cost-breakdown';
import { EcommerceSalesByCountry } from '../../sections/dashboard/ecommerce/ecommerce-sales-by-country';
import { EcommerceSalesRevenue } from '../../sections/dashboard/ecommerce/ecommerce-sales-revenue';
import { EcommerceProducts } from '../../sections/dashboard/ecommerce/ecommerce-products';
import { EcommerceStats } from '../../sections/dashboard/ecommerce/ecommerce-stats';
import { OverviewTransactions } from 'src/sections/dashboard/overview/overview-transactions';
import { OverviewSubscriptionUsage } from 'src/sections/dashboard/overview/overview-subscription-usage';

const now = new Date();

const Page: NextPage = () => {
  const settings = useSettings();
  const { from, to, bucket } = useTimeContext();

  usePageView();

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
                        <RefreshCcw01Icon />
                      </SvgIcon>
                    )}
                    variant="contained"
                  >
                    Sync Data
                  </Button> */}
                </Stack>
              </Stack>
            </Grid>
            <Grid
              xs={12}
              lg={8}
            >
              <Stack
                spacing={{
                  xs: 3,
                  lg: 4
                }}
              >
                {/* <EcommerceStats
                  average={69}
                  max={72}
                  min={64}
                /> */}
                {/* <EcommerceSalesRevenue
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
                /> */}
              {/* <OverviewBanner /> */}
              <OverviewSubscriptionUsage
                chartSeries={[
                  {
                    name: 'This year',
                    data: [40, 37, 41, 42, 45, 42, 36, 45, 40, 44, 38, 41]
                  },
                  {
                    name: 'Last year',
                    data: [26, 22, 19, 22, 24, 28, 23, 25, 24, 21, 17, 19]
                  }
                ]}
              />
              <OverviewTransactions
                transactions={[
                  {
                    id: 'd46800328cd510a668253b45',
                    amount: 25000,
                    createdAt: now.getTime(),
                    currency: 'usd',
                    sender: 'Devias',
                    status: 'on_hold',
                    type: 'receive'
                  },
                  {
                    id: 'b4b19b21656e44b487441c50',
                    amount: 6843,
                    createdAt: subDays(now, 1).getTime(),
                    currency: 'usd',
                    sender: 'Zimbru',
                    status: 'confirmed',
                    type: 'send'
                  },
                  {
                    id: '56c09ad91f6d44cb313397db',
                    amount: 91823,
                    createdAt: subDays(now, 1).getTime(),
                    currency: 'usd',
                    sender: 'Vertical Jelly',
                    status: 'failed',
                    type: 'send'
                  },
                  {
                    id: 'aaeb96c5a131a55d9623f44d',
                    amount: 49550,
                    createdAt: subDays(now, 3).getTime(),
                    currency: 'usd',
                    sender: 'Devias',
                    status: 'confirmed',
                    type: 'receive'
                  }
                ]}
              />   
                {/* <EcommerceSalesByCountry
                  sales={[
                    {
                      id: 'us',
                      amount: 60,
                      country: 'United States'
                    },
                    {
                      id: 'es',
                      amount: 20,
                      country: 'Spain'
                    },
                    {
                      id: 'uk',
                      amount: 10,
                      country: 'United Kingdom'
                    },
                    {
                      id: 'de',
                      amount: 5,
                      country: 'Germany'
                    },
                    {
                      id: 'ca',
                      amount: 5,
                      country: 'Canada'
                    }
                  ]}
                /> */}
              </Stack>
            </Grid>
            <Grid
              xs={12}
              lg={4}
            >
              <Stack
                spacing={{
                  xs: 3,
                  lg: 4
                }}
              >
                <EcommerceProducts
                  products={[
                    {
                      id: '5eff2512c6f8737d08325676',
                      category: 'Accessories',
                      image: '/assets/products/product-1.png',
                      name: 'Healthcare Erbology',
                      sales: 13153
                    },
                    {
                      id: '5eff2516247f9a6fcca9f151',
                      category: 'Accessories',
                      image: '/assets/products/product-2.png',
                      name: 'Makeup Lancome Rouge',
                      sales: 10300
                    },
                    {
                      id: '5eff251a3bb9ab7290640f18',
                      category: 'Accessories',
                      name: 'Lounge Puff Fabric Slipper',
                      sales: 5300
                    },
                    {
                      id: '5eff251e297fd17f0dc18a8b',
                      category: 'Accessories',
                      image: '/assets/products/product-4.png',
                      name: 'Skincare Necessaire',
                      sales: 1203
                    },
                    {
                      id: '5eff2524ef813f061b3ea39f',
                      category: 'Accessories',
                      image: '/assets/products/product-5.png',
                      name: 'Skincare Soja CO',
                      sales: 254
                    }
                  ]}
                />
           
              </Stack>
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
