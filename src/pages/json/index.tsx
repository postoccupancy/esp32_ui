import type { NextPage } from 'next';
import Head from 'next/head';
import { Box } from '@mui/material';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { useESP32, useESP32Aggregates } from '@/hooks/use-esp32';
import { getDateMsAgo, midnightTomorrow, rangeOptions } from '@/utils/dataHelpers';
import { useMemo } from 'react';
import { buildThresholdEvents } from '@/utils/build-threshold-events';
import { useTimeContext } from '@/contexts/time-context';


const Page: NextPage = () => {
// what do these do?
//   const settings = useSettings();
//   usePageView();
  const start_ts = useMemo(
  () => getDateMsAgo(rangeOptions.sevenDays).toISOString(),
    []
  );

  const end_ts = useMemo(
    () => midnightTomorrow().toISOString(),
    []
  );
    const { 
      data, 
      error, 
      isSuccess 
    } = useESP32({
      start_ts, 
      end_ts, 
      order_desc: true,
    });
    const readings = data?.readings || [];

  // const { bucketValue } = useTimeContext();
  const bucketValue = 300; // always use 5 minutes for events
  const { 
    data: aggregatesData, 
    error: aggregatesError, 
    isSuccess: aggregatesIsSuccess 
  } = useESP32Aggregates({
    start_ts, 
    end_ts, 
    bucket: bucketValue,  
    order_desc: true,
    limit: 1000,
  });
  const aggregates = useMemo(() => aggregatesData?.aggregates || [], [aggregatesData]);

  const events = useMemo(
    () =>
      buildThresholdEvents(aggregates, {
        thresholdPct: 0.1, // 0.1
        expectedSamplePeriodSeconds: 2,
      }),
    [aggregates]
  );



  return (
    <>
      <Head>
        <title>
          JSON test
        </title>
      </Head>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          py: 8
        }}
      >
        Date from 7 days ago: {start_ts}
        <br />
        Date from now: {end_ts}
        <br />
        Error: {error instanceof Error ? error.message : "No error"}
        <br />
        Aggregates Error: {aggregatesError instanceof Error ? aggregatesError.message : "No error"}
        <br />
        Success: {isSuccess ? "Yes" : "No"}
        <br />
        Aggregates Success: {aggregatesIsSuccess ? "Yes" : "No"}
        <br />
        Readings count: {readings.length}
        <br />
        Aggregates count: {aggregates.length}
        <br />
        Events count: {events.length}
        <br />
        And here is the {events ? "events" : aggregates ? "aggregates" : "raw"} data from the ESP32 API:
        <pre>{JSON.stringify(events.filter(e => e.breachCount > 0), null, 2)}</pre>
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
