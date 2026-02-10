import { useCallback, useEffect, useState } from 'react';
import type { NextPage } from 'next';
import NextLink from 'next/link';
import Head from 'next/head';
import ArrowLeftIcon from '@untitled-ui/icons-react/build/esm/ArrowLeft';
import { Avatar, Box, Chip, Container, Link, Stack, SvgIcon, Typography } from '@mui/material';
import { locationsApi } from '../../../../api/locations';
import { useMounted } from '../../../../hooks/use-mounted';
import { usePageView } from '../../../../hooks/use-page-view';
import { Layout as DashboardLayout } from '../../../../layouts/dashboard';
import { paths } from '../../../../paths';
import { LocationEditForm } from '../../../../sections/dashboard/location/location-edit-form';
import type { Location } from '../../../../types/location';
import { getInitials } from '../../../../utils/get-initials';

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

const Page: NextPage = () => {
  const location = useLocation();

  usePageView();

  if (!location) {
    return null;
  }

  return (
    <>
      <Head>
        <title>
          Dashboard: Location Edit | Devias Kit PRO
        </title>
      </Head>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          py: 8
        }}
      >
        <Container maxWidth="lg">
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
              </Stack>
            </Stack>
            <LocationEditForm location={location} />
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
