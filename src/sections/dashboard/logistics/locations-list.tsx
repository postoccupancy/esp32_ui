import type { FC } from 'react';
import PropTypes from 'prop-types';
import { Divider, Stack } from '@mui/material';
import type { Location } from '../../../types/location';
import { LocationsListItem } from './locations-list-item';

interface LocationsListProps {
  currentLocationId?: string;
  onLocationDeselect?: () => void;
  onLocationSelect?: (locationId: string) => void;
  locations?: Location[];
}

export const LocationsList: FC<LocationsListProps> = (props) => {
  const { onLocationDeselect, onLocationSelect, currentLocationId, locations = [] } = props;

  return (
    <Stack
      component="ul"
      divider={<Divider />}
      sx={{
        borderBottomColor: 'divider',
        borderBottomStyle: 'solid',
        borderBottomWidth: 1,
        listStyle: 'none',
        m: 0,
        p: 0
      }}
    >
      {locations.map((location) => {
        const selected = currentLocationId ? currentLocationId === location.id : false;

        return (
          <LocationsListItem
            key={location.id}
            onDeselect={onLocationDeselect}
            onSelect={onLocationSelect}
            selected={selected}
            location={location}
          />
        );
      })}
    </Stack>
  );
};

LocationsList.propTypes = {
  currentLocationId: PropTypes.string,
  onLocationDeselect: PropTypes.func,
  onLocationSelect: PropTypes.func,
  locations: PropTypes.array
};
