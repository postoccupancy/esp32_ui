import type { ChangeEvent, FC, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import numeral from 'numeral';
import PropTypes from 'prop-types';
import ArrowRightIcon from '@untitled-ui/icons-react/build/esm/ArrowRight';
import Edit02Icon from '@untitled-ui/icons-react/build/esm/Edit02';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  IconButton,
  Link,
  Stack,
  SvgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from '@mui/material';
import { Scrollbar } from '../../../components/scrollbar';
import { paths } from '../../../paths';
import type { Location } from '../../../types/location';
import { getInitials } from '../../../utils/get-initials';

interface SelectionModel {
  deselectAll: () => void;
  deselectOne: (locationId: string) => void;
  selectAll: () => void;
  selectOne: (locationId: string) => void;
  selected: string[];
}

const useSelectionModel = (locations: Location[]): SelectionModel => {
  const locationIds = useMemo(
    () => {
      return locations.map((location) => location.id);
    },
    [locations]
  );
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(
    () => {
      setSelected([]);
    },
    [locationIds]
  );

  const selectOne = useCallback(
    (locationId: string): void => {
      setSelected((prevState) => [...prevState, locationId]);
    },
    []
  );

  const deselectOne = useCallback(
    (locationId: string): void => {
      setSelected((prevState) => {
        return prevState.filter((id) => id !== locationId);
      });
    },
    []
  );

  const selectAll = useCallback(
    (): void => {
      setSelected([...locationIds]);
    },
    [locationIds]
  );

  const deselectAll = useCallback(
    () => {
      setSelected([]);
    },
    []
  );

  return {
    deselectAll,
    deselectOne,
    selectAll,
    selectOne,
    selected
  };
};

interface LocationListTableProps {
  locations: Location[];
  locationsCount: number;
  onPageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void;
  onRowsPerPageChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  page: number;
  rowsPerPage: number;
}

export const LocationListTable: FC<LocationListTableProps> = (props) => {
  const {
    locations,
    locationsCount,
    onPageChange,
    onRowsPerPageChange,
    page,
    rowsPerPage,
    ...other
  } = props;
  const {
    deselectAll,
    selectAll,
    deselectOne,
    selectOne,
    selected
  } = useSelectionModel(locations);

  const handleToggleAll = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const { checked } = event.target;

      if (checked) {
        selectAll();
      } else {
        deselectAll();
      }
    },
    [selectAll, deselectAll]
  );

  const selectedAll = selected.length === locations.length;
  const selectedSome = selected.length > 0 && selected.length < locations.length;
  const enableBulkActions = selected.length > 0;

  return (
    <Box
      sx={{ position: 'relative' }}
      {...other}
    >
      {enableBulkActions && (
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            backgroundColor: (theme) => theme.palette.mode === 'dark'
              ? 'neutral.800'
              : 'neutral.50',
            display: enableBulkActions ? 'flex' : 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            px: 2,
            py: 0.5,
            zIndex: 10
          }}
        >
          <Checkbox
            checked={selectedAll}
            indeterminate={selectedSome}
            onChange={handleToggleAll}
          />
          <Button
            color="inherit"
            size="small"
          >
            Delete
          </Button>
          <Button
            color="inherit"
            size="small"
          >
            Edit
          </Button>
        </Stack>
      )}
      <Scrollbar>
        <Table sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedAll}
                  indeterminate={selectedSome}
                  onChange={handleToggleAll}
                />
              </TableCell>
              <TableCell>
                Name
              </TableCell>
              <TableCell>
                Location
              </TableCell>
              <TableCell>
                Orders
              </TableCell>
              <TableCell>
                Spent
              </TableCell>
              <TableCell align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {locations.map((location) => {
              const isSelected = selected.includes(location.id);
              const locationLabel = `${location.city}, ${location.state}, ${location.country}`;
              const totalSpent = numeral(location.totalSpent).format(`${location.currency}0,0.00`);
              const hrefDetails = paths.dashboard.locations.details.replace(':locationId', location.id);
              const hrefEdit = paths.dashboard.locations.edit.replace(':locationId', location.id);
              return (
                <TableRow
                  hover
                  key={location.id}
                  selected={isSelected}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => {
                        const { checked } = event.target;

                        if (checked) {
                          selectOne(location.id);
                        } else {
                          deselectOne(location.id);
                        }
                      }}
                      value={isSelected}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack
                      alignItems="center"
                      direction="row"
                      spacing={1}
                    >
                      <Avatar
                        src={location.avatar}
                        sx={{
                          height: 42,
                          width: 42
                        }}
                      >
                        {getInitials(location.name)}
                      </Avatar>
                      <div>
                        <Link
                          color="inherit"
                          component={NextLink}
                          href={hrefDetails}
                          variant="subtitle2"
                        >
                          {location.name}
                        </Link>
                        <Typography
                          color="text.secondary"
                          variant="body2"
                        >
                          {location.email}
                        </Typography>
                      </div>
                    </Stack>
                  </TableCell>
                  <TableCell>
                      {locationLabel}
                  </TableCell>
                  <TableCell>
                    {location.totalOrders}
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2">
                      {totalSpent}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      component={NextLink}
                      href={hrefEdit}
                    >
                      <SvgIcon>
                        <Edit02Icon />
                      </SvgIcon>
                    </IconButton>
                    <IconButton
                      component={NextLink}
                      href={hrefDetails}
                    >
                      <SvgIcon>
                        <ArrowRightIcon />
                      </SvgIcon>
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Scrollbar>
      <TablePagination
        component="div"
        count={locationsCount}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[5, 10, 25]}
      />
    </Box>
  );
};

LocationListTable.propTypes = {
  locations: PropTypes.array.isRequired,
  locationsCount: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  onRowsPerPageChange: PropTypes.func,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired
};
