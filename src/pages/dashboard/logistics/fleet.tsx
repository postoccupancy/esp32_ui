import { useCallback, useEffect, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import type { Theme } from '@mui/material';
import { Box, Divider, Typography, useMediaQuery } from '@mui/material';
import { Layout as DashboardLayout } from '../../../layouts/dashboard';
import { locationsApi } from '../../../api/locations';
import type { Location } from '../../../types/location';
import { useMounted } from '../../../hooks/use-mounted';
import { LocationsMapDrawer } from '../../../sections/dashboard/logistics/locations-map-drawer';
import { LocationsList } from '../../../sections/dashboard/logistics/locations-list';
import { LocationsMap } from '../../../sections/dashboard/logistics/locations-map';
import { LocationsMapToolbar } from '../../../sections/dashboard/logistics/locations-map-toolbar';

const useLocations = (): Location[] => {
  const isMounted = useMounted();
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();

        if (isMounted()) {
          setLocations(response.data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchLocations();
  }, [isMounted]);

  return locations;
};

const Page: NextPage = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mdUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
  const locations = useLocations();
  const [openDrawer, setOpenDrawer] = useState<boolean>(false);
  const [currentLocationId, setCurrentLocationId] = useState<string | undefined>(locations[0]?.id);

  useEffect(() => {
    if (!currentLocationId && locations[0]) {
      setCurrentLocationId(locations[0].id);
    }
  }, [locations, currentLocationId]);

  const handleLocationSelect = useCallback(
    (locationId: string): void => {
      setCurrentLocationId(locationId);
    },
    []
  );

  const handleLocationDeselect = useCallback(
    (): void => {
      setCurrentLocationId(undefined);
    },
    []
  );

  const handleDrawerOpen = useCallback(
    (): void => {
      setOpenDrawer(true);
    },
    []
  );

  const handleDrawerClose = useCallback(
    (): void => {
      setOpenDrawer(false);
    },
    []
  );

  return (
    <>
      <Head>
        <title>
          Dashboard: Locations Map | Devias Kit PRO
        </title>
      </Head>
      <Divider />
      <Box
        component="main"
        ref={rootRef}
        sx={{
          display: 'flex',
          flex: '1 1 auto',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {mdUp && (
          <Box
            sx={{
              borderRightColor: 'divider',
              borderRightStyle: 'solid',
              borderRightWidth: 1,
              flex: '0 0 400px'
            }}
          >
            <Box sx={{ p: 2 }}>
              <Typography variant="h5">
                Locations
              </Typography>
            </Box>
            <LocationsList
              currentLocationId={currentLocationId}
              onLocationDeselect={handleLocationDeselect}
              onLocationSelect={handleLocationSelect}
              locations={locations}
            />
          </Box>
        )}
        <Box
          sx={{
            flex: '1 1 auto',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {!mdUp && <LocationsMapToolbar onDrawerOpen={handleDrawerOpen} />}
          <LocationsMap
            currentLocationId={currentLocationId}
            onLocationSelect={handleLocationSelect}
            locations={locations}
          />
        </Box>
      </Box>
      {!mdUp && (
        <LocationsMapDrawer
          container={rootRef.current}
          onClose={handleDrawerClose}
          open={openDrawer}
        >
          <LocationsList
            currentLocationId={currentLocationId}
            onLocationDeselect={handleLocationDeselect}
            onLocationSelect={handleLocationSelect}
            locations={locations}
          />
        </LocationsMapDrawer>
      )}
    </>
  );
};

Page.getLayout = (page) => (
  <DashboardLayout>
    {page}
  </DashboardLayout>
);

export default Page;
