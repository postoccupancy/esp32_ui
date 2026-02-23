import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Unstable_Grid2 as Grid
} from '@mui/material';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { alertsApi } from '../../api/alerts';
import { TimeContextControls } from '../../components/time-context-controls';
import { useTimeContext } from '../../contexts/time-context';
import { usePageView } from '../../hooks/use-page-view';
import { useSettings } from '../../hooks/use-settings';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { paths } from '../../paths';
import { AlertDetailsDrawer } from '../../sections/dashboard/alerts/alert-details-drawer';
import type { Alert, AlertCategory, AlertStatus } from '../../types/alert';

const categories: Array<{ label: string; value: 'all' | AlertCategory }> = [
  { label: 'All', value: 'all' },
  { label: 'Environment', value: 'environment' },
  { label: 'System', value: 'system' }
];

const statuses: Array<{ label: string; value: 'all' | AlertStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Resolved', value: 'resolved' }
];

const getSeverityColor = (severity: Alert['severity']) => {
  if (severity === 'critical') {
    return 'error';
  }

  if (severity === 'warning') {
    return 'warning';
  }

  return 'info';
};

const Page: NextPage = () => {
  const settings = useSettings();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { from, to } = useTimeContext();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const selectedCategory = useMemo<'all' | AlertCategory>(() => {
    const category = router.query.category;

    if (category === 'environment' || category === 'system') {
      return category;
    }

    return 'all';
  }, [router.query.category]);

  const selectedStatus = useMemo<'all' | AlertStatus>(() => {
    const status = router.query.status;

    if (status === 'open' || status === 'acknowledged' || status === 'resolved') {
      return status;
    }

    return 'all';
  }, [router.query.status]);

  const selectedAlertId = useMemo<string | undefined>(() => {
    const alertId = router.query.alertId;

    if (typeof alertId === 'string') {
      return alertId;
    }

    return undefined;
  }, [router.query.alertId]);

  const updateFilters = useCallback((next: { category?: string; status?: string }) => {
    const nextQuery: {
      category?: string;
      status?: string;
    } = {
      category: next.category ?? selectedCategory,
      status: next.status ?? selectedStatus
    };

    if (nextQuery.category === 'all') {
      delete nextQuery.category;
    }

    if (nextQuery.status === 'all') {
      delete nextQuery.status;
    }

    router.push(
      {
        pathname: paths.dashboard.alerts,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const handleAlertSelect = useCallback((alertId: string): void => {
    const nextQuery: {
      category?: string;
      status?: string;
      alertId?: string;
    } = {
      alertId
    };

    if (selectedCategory !== 'all') {
      nextQuery.category = selectedCategory;
    }

    if (selectedStatus !== 'all') {
      nextQuery.status = selectedStatus;
    }

    router.push(
      {
        pathname: paths.dashboard.alerts,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const handleDrawerClose = useCallback(() => {
    const nextQuery: {
      category?: string;
      status?: string;
    } = {};

    if (selectedCategory !== 'all') {
      nextQuery.category = selectedCategory;
    }

    if (selectedStatus !== 'all') {
      nextQuery.status = selectedStatus;
    }

    router.push(
      {
        pathname: paths.dashboard.alerts,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  }, [router, selectedCategory, selectedStatus]);

  const handleAlertSave = useCallback((alertId: string, updates: Partial<Alert>) => {
    setAlerts((prevState) => prevState.map((alert) => (
      alert.id === alertId
        ? {
            ...alert,
            ...updates
          }
        : alert
    )));
  }, []);

  useEffect(() => {
    void alertsApi
      .getAlerts({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        status: selectedStatus === 'all' ? undefined : selectedStatus
      })
      .then((response) => {
        const fromMs = from.getTime();
        const toMs = to.getTime();
        const windowedAlerts = response.data.filter((alert) => (
          alert.createdAt >= fromMs && alert.createdAt <= toMs
        ));

        setAlerts(windowedAlerts);

        // Only clear alertId after we have fresh filtered data and can prove it does not exist.
        if (selectedAlertId && !windowedAlerts.some((alert) => alert.id === selectedAlertId)) {
          handleDrawerClose();
        }
      });
  }, [from, handleDrawerClose, selectedAlertId, selectedCategory, selectedStatus, to]);

  usePageView();

  const openCount = alerts.filter((alert) => alert.status === 'open').length;
  const environmentOpenCount = alerts.filter((alert) => (
    alert.category === 'environment' && alert.status === 'open'
  )).length;
  const systemOpenCount = alerts.filter((alert) => (
    alert.category === 'system' && alert.status === 'open'
  )).length;
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || null;

  return (
    <>
      <Head>
        <title>Dashboard: Alerts | Devias Kit PRO</title>
      </Head>
      <Box
        component="main"
        sx={{
          display: 'flex',
          flex: '1 1 auto',
          height: { lg: 'calc(100vh - 64px)' },
          overflow: 'hidden',
          py: 4
        }}
      >
        <Container
          maxWidth={settings.stretch ? false : 'xl'}
          sx={{
            display: 'flex',
            flex: '1 1 auto',
            height: '100%',
            minHeight: 0
          }}
        >
          <Box
            ref={rootRef}
            sx={{
              display: 'flex',
              flex: '1 1 auto',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <Box
              sx={{
                flex: '1 1 auto',
                minWidth: 0,
                overflowY: 'auto',
                pr: { lg: 3 }
              }}
            >
              <Stack spacing={3}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Stack spacing={1}>
                    <Typography variant="h4">
                      Alerts
                    </Typography>
                    <Typography
                      color="text.secondary"
                      variant="body2"
                    >
                      Unified stream for environmental threshold alerts and sensor/system health alerts.
                    </Typography>
                    <Chip
                      label={`${format(from, 'MMM d, HH:mm')} - ${format(to, 'MMM d, HH:mm')}`}
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
                    <TimeContextControls showBucket={false} />
                  </Stack>
                </Stack>
                <Grid
                  container
                  spacing={2}
                >
                  <Grid xs={12}
md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary"
variant="overline">Open Alerts</Typography>
                        <Typography variant="h4">{openCount}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12}
md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary"
variant="overline">Environment Open</Typography>
                        <Typography variant="h4">{environmentOpenCount}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12}
md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary"
variant="overline">System Open</Typography>
                        <Typography variant="h4">{systemOpenCount}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
                <Card>
                  <CardContent>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={2}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        {categories.map((item) => (
                          <Chip
                            clickable
                            key={item.value}
                            label={item.label}
                            onClick={() => updateFilters({ category: item.value })}
                            variant={selectedCategory === item.value ? 'filled' : 'outlined'}
                          />
                        ))}
                      </Stack>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        {statuses.map((item) => (
                          <Chip
                            clickable
                            key={item.value}
                            label={item.label}
                            onClick={() => updateFilters({ status: item.value })}
                            variant={selectedStatus === item.value ? 'filled' : 'outlined'}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                  <Divider />
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Alert</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Location</TableCell>
                        <TableCell>Age</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {alerts.map((alert) => (
                        <TableRow
                          hover
                          key={alert.id}
                          onClick={() => handleAlertSelect(alert.id)}
                          selected={selectedAlertId === alert.id}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Typography variant="subtitle2">{alert.title}</Typography>
                              <Typography color="text.secondary"
variant="body2">{alert.description}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={alert.category}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              color={getSeverityColor(alert.severity)}
                              label={alert.severity}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={alert.status}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{alert.locationName}</TableCell>
                          <TableCell>{formatDistanceToNowStrict(alert.createdAt)} ago</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
                <Stack direction="row"
justifyContent="flex-end">
                  <Button
                    component={NextLink}
                    href={paths.dashboard.index}
                    variant="text"
                  >
                    Back to Dashboard
                  </Button>
                </Stack>
              </Stack>
            </Box>
            <AlertDetailsDrawer
              alert={selectedAlert}
              container={rootRef.current}
              onClose={handleDrawerClose}
              onSave={handleAlertSave}
              open={Boolean(selectedAlertId)}
            />
          </Box>
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
