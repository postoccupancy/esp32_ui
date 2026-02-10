import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { NextPage } from 'next';
import NextLink from 'next/link';
import Head from 'next/head';
import ArrowLeftIcon from '@untitled-ui/icons-react/build/esm/ArrowLeft';
import ChevronDownIcon from '@untitled-ui/icons-react/build/esm/ChevronDown';
import Edit02Icon from '@untitled-ui/icons-react/build/esm/Edit02';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Link,
  Stack,
  SvgIcon,
  Tab,
  Tabs,
  Typography,
  Unstable_Grid2 as Grid
} from '@mui/material';
import { locationsApi } from '../../../../api/locations';
import { useMounted } from '../../../../hooks/use-mounted';
import { usePageView } from '../../../../hooks/use-page-view';
import { Layout as DashboardLayout } from '../../../../layouts/dashboard';
import { paths } from '../../../../paths';
import { LocationBasicDetails } from '../../../../sections/dashboard/location/location-basic-details';
import { LocationDataManagement } from '../../../../sections/dashboard/location/location-data-management';
import { LocationEmailsSummary } from '../../../../sections/dashboard/location/location-emails-summary';
import { LocationInvoices } from '../../../../sections/dashboard/location/location-invoices';
import { LocationPayment } from '../../../../sections/dashboard/location/location-payment';
import { LocationLogs } from '../../../../sections/dashboard/location/location-logs';
import type { Location } from '../../../../types/location';
import { LocationInvoice, LocationLog } from '../../../../types/location';
import { getInitials } from '../../../../utils/get-initials';

const tabs = [
  { label: 'Details', value: 'details' },
  { label: 'Invoices', value: 'invoices' },
  { label: 'Logs', value: 'logs' }
];

const useLocation = (): Location | null => {
  const isMounted = useMounted();
  const [location, setLocation] = useState<Location | null>(null);

  const getLocation = useCallback(async () => {
    try {
      const response = await locationsApi.getLocation();

      if (isMounted()) {
        setLocation(response);
      }
    } catch (err) {
      console.error(err);
    }
  }, [isMounted]);

  useEffect(
    () => {
      getLocation();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return location;
};

const useInvoices = (): LocationInvoice[] => {
  const isMounted = useMounted();
  const [invoices, setInvoices] = useState<LocationInvoice[]>([]);

  const getInvoices = useCallback(async () => {
    try {
      const response = await locationsApi.getInvoices();

      if (isMounted()) {
        setInvoices(response);
      }
    } catch (err) {
      console.error(err);
    }
  }, [isMounted]);

  useEffect(
    () => {
      getInvoices();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return invoices;
};

const useLogs = (): LocationLog[] => {
  const isMounted = useMounted();
  const [logs, setLogs] = useState<LocationLog[]>([]);

  const getLogs = useCallback(async () => {
    try {
      const response = await locationsApi.getLogs();

      if (isMounted()) {
        setLogs(response);
      }
    } catch (err) {
      console.error(err);
    }
  }, [isMounted]);

  useEffect(
    () => {
      getLogs();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return logs;
};

const Page: NextPage = () => {
  const [currentTab, setCurrentTab] = useState<string>('details');
  const location = useLocation();
  const invoices = useInvoices();
  const logs = useLogs();

  usePageView();

  const handleTabsChange = useCallback(
    (event: ChangeEvent<{}>, value: string): void => {
      setCurrentTab(value);
    },
    []
  );

  if (!location) {
    return null;
  }

  return (
    <>
      <Head>
        <title>
          Dashboard: Location Details | Devias Kit PRO
        </title>
      </Head>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          py: 8
        }}
      >
        <Container maxWidth="xl">
          <Stack spacing={4}>
            <Stack spacing={4}>
              <div>
                <Link
                  color="text.primary"
                  component={NextLink}
                  href={paths.dashboard.locations.index}
                  sx={{
                    alignItems: 'center',
                    display: 'inline-flex'
                  }}
                  underline="hover"
                >
                  <SvgIcon sx={{ mr: 1 }}>
                    <ArrowLeftIcon />
                  </SvgIcon>
                  <Typography variant="subtitle2">
                    Locations
                  </Typography>
                </Link>
              </div>
              <Stack
                alignItems="flex-start"
                direction={{
                  xs: 'column',
                  md: 'row'
                }}
                justifyContent="space-between"
                spacing={4}
              >
                <Stack
                  alignItems="center"
                  direction="row"
                  spacing={2}
                >
                  <Avatar
                    src={location.avatar}
                    sx={{
                      height: 64,
                      width: 64
                    }}
                  >
                    {getInitials(location.name)}
                  </Avatar>
                  <Stack spacing={1}>
                    <Typography variant="h4">
                      {location.email}
                    </Typography>
                    <Stack
                      alignItems="center"
                      direction="row"
                      spacing={1}
                    >
                      <Typography variant="subtitle2">
                        user_id:
                      </Typography>
                      <Chip
                        label={location.id}
                        size="small"
                      />
                    </Stack>
                  </Stack>
                </Stack>
                <Stack
                  alignItems="center"
                  direction="row"
                  spacing={2}
                >
                  <Button
                    color="inherit"
                    component={NextLink}
                    endIcon={(
                      <SvgIcon>
                        <Edit02Icon />
                      </SvgIcon>
                    )}
                    href={paths.dashboard.locations.edit}
                  >
                    Edit
                  </Button>
                  <Button
                    endIcon={(
                      <SvgIcon>
                        <ChevronDownIcon />
                      </SvgIcon>
                    )}
                    variant="contained"
                  >
                    Actions
                  </Button>
                </Stack>
              </Stack>
              <div>
                <Tabs
                  indicatorColor="primary"
                  onChange={handleTabsChange}
                  scrollButtons="auto"
                  sx={{ mt: 3 }}
                  textColor="primary"
                  value={currentTab}
                  variant="scrollable"
                >
                  {tabs.map((tab) => (
                    <Tab
                      key={tab.value}
                      label={tab.label}
                      value={tab.value}
                    />
                  ))}
                </Tabs>
                <Divider />
              </div>
            </Stack>
            {currentTab === 'details' && (
              <div>
                <Grid
                  container
                  spacing={4}
                >
                  <Grid
                    xs={12}
                    lg={4}
                  >
                    <LocationBasicDetails
                      address1={location.address1}
                      address2={location.address2}
                      country={location.country}
                      email={location.email}
                      isVerified={!!location.isVerified}
                      phone={location.phone}
                      state={location.state}
                    />
                  </Grid>
                  <Grid
                    xs={12}
                    lg={8}
                  >
                    <Stack spacing={4}>
                      <LocationPayment />
                      <LocationEmailsSummary />
                      <LocationDataManagement />
                    </Stack>
                  </Grid>
                </Grid>
              </div>
            )}
            {currentTab === 'invoices' && <LocationInvoices invoices={invoices} />}
            {currentTab === 'logs' && <LocationLogs logs={logs} />}
          </Stack>
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

