import type { ChangeEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import FilterFunnel01Icon from '@untitled-ui/icons-react/build/esm/FilterFunnel01';
import PlusIcon from '@untitled-ui/icons-react/build/esm/Plus';
import type { Theme } from '@mui/material';
import { Box, Button, Divider, Stack, SvgIcon, Typography, useMediaQuery } from '@mui/material';
import { invoicesApi } from '../../../api/invoices';
import { useMounted } from '../../../hooks/use-mounted';
import { usePageView } from '../../../hooks/use-page-view';
import { Layout as DashboardLayout } from '../../../layouts/dashboard';
import { InvoiceListContainer } from '../../../sections/dashboard/invoice/invoice-list-container';
import { InvoiceListSidebar } from '../../../sections/dashboard/invoice/invoice-list-sidebar';
import { InvoiceListSummary } from '../../../sections/dashboard/invoice/invoice-list-summary';
import { InvoiceListTable } from '../../../sections/dashboard/invoice/invoice-list-table';
import type { Invoice, InvoiceStatus } from '../../../types/invoice';

interface Filters {
  customers?: string[];
  endDate?: Date;
  query?: string;
  startDate?: Date;
  status?: InvoiceStatus;
}

interface Search {
  filters: Filters;
  page: number;
  rowsPerPage: number;
}

const useSearch = () => {
  const [search, setSearch] = useState<Search>({
    filters: {
      customers: [],
      endDate: undefined,
      query: '',
      startDate: undefined
    },
    page: 0,
    rowsPerPage: 5
  });

  return {
    search,
    updateSearch: setSearch
  };
};

const useInvoices = (search: Search): { invoices: Invoice[]; invoicesCount: number; } => {
  const isMounted = useMounted();
  const [state, setState] = useState<{
    invoices: Invoice[];
    invoicesCount: number;
  }>({
    invoices: [],
    invoicesCount: 0
  });

  const getInvoices = useCallback(
    async () => {
      try {
        const response = await invoicesApi.getInvoices(search);

        if (isMounted()) {
          setState({
            invoices: response.data,
            invoicesCount: response.count
          });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [search, isMounted]
  );

  useEffect(
    () => {
      getInvoices();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search]
  );

  return state;
};

const Page: NextPage = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const [group, setGroup] = useState<boolean>(true);
  const [openSidebar, setOpenSidebar] = useState<boolean>(lgUp);
  const { search, updateSearch } = useSearch();
  const { invoices, invoicesCount } = useInvoices(search);

  usePageView();

  const handleGroupChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setGroup(event.target.checked);
    },
    []
  );

  const handleFiltersToggle = useCallback(
    (): void => {
      setOpenSidebar((prevState) => !prevState);
    },
    []
  );

  const handleFiltersChange = useCallback(
    (filters: Filters): void => {
      updateSearch((prevState) => ({
        ...prevState,
        filters,
        page: 0
      }));
    },
    [updateSearch]
  );

  const handleFiltersClose = useCallback(
    (): void => {
      setOpenSidebar(false);
    },
    []
  );

  const handlePageChange = useCallback(
    (event: MouseEvent<HTMLButtonElement> | null, page: number): void => {
      updateSearch((prevState) => ({
        ...prevState,
        page
      }));
    },
    [updateSearch]
  );

  const handleRowsPerPageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      updateSearch((prevState) => ({
        ...prevState,
        rowsPerPage: parseInt(event.target.value, 10)
      }));
    },
    [updateSearch]
  );

  return (
    <>
      <Head>
        <title>
          Dashboard: Invoice List | Devias Kit PRO
        </title>
      </Head>
      <Divider />
      <Box
        component="main"
        sx={{
          display: 'flex',
          flex: '1 1 auto',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <Box
          ref={rootRef}
          sx={{
            bottom: 0,
            display: 'flex',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0
          }}
        >
          <InvoiceListSidebar
            container={rootRef.current}
            filters={search.filters}
            group={group}
            onFiltersChange={handleFiltersChange}
            onClose={handleFiltersClose}
            onGroupChange={handleGroupChange}
            open={openSidebar}
          />
          <InvoiceListContainer open={openSidebar}>
            <Stack spacing={4}>
              <Stack
                alignItems="flex-start"
                direction="row"
                justifyContent="space-between"
                spacing={3}
              >
                <div>
                  <Typography variant="h4">
                    Invoices
                  </Typography>
                </div>
                <Stack
                  alignItems="center"
                  direction="row"
                  spacing={1}
                >
                  <Button
                    color="inherit"
                    startIcon={(
                      <SvgIcon>
                        <FilterFunnel01Icon />
                      </SvgIcon>
                    )}
                    onClick={handleFiltersToggle}
                  >
                    Filters
                  </Button>
                  <Button
                    startIcon={(
                      <SvgIcon>
                        <PlusIcon />
                      </SvgIcon>
                    )}
                    variant="contained"
                  >
                    New
                  </Button>
                </Stack>
              </Stack>
              <InvoiceListSummary />
              <InvoiceListTable
                group={group}
                invoices={invoices}
                invoicesCount={invoicesCount}
                onPageChange={handlePageChange}
                onRowsPerPageChange={handleRowsPerPageChange}
                page={search.page}
                rowsPerPage={search.rowsPerPage}
              />
            </Stack>
          </InvoiceListContainer>
        </Box>
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
