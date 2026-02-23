import type { NextPage } from 'next';
import Head from 'next/head';
import { Box } from '@mui/material';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { useESP32, useESP32Aggregates } from '@/hooks/use-esp32';
import { getDateMsAgo, midnightTomorrow, rangeOptions } from '@/utils/dataHelpers';
import { useMemo } from 'react';


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

  const { 
    data: aggregatesData, 
    error: aggregatesError, 
    isSuccess: aggregatesIsSuccess 
  } = useESP32Aggregates({
    start_ts, 
    end_ts, 
    bucket: 3600, // 1 hour buckets 
    order_desc: false,
    limit: 1000,
  });
  const aggregates = aggregatesData?.aggregates || [];

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
        And here is the data from the ESP32 API:
        <pre>{JSON.stringify(aggregates, null, 2)}</pre>
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
