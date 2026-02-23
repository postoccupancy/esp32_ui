import type { FC } from 'react';
import { useCallback } from 'react';
import MarkerPin01Icon from '@untitled-ui/icons-react/build/esm/MarkerPin01';
import {
  Avatar,
  Box,
  ButtonBase,
  Collapse,
  Stack,
  SvgIcon,
  Typography
} from '@mui/material';
import type { Location } from '../../../types/location';

interface LocationsListItemProps {
  onDeselect?: () => void;
  onSelect?: (locationId: string) => void;
  selected?: boolean;
  location: Location;
}

export const LocationsListItem: FC<LocationsListItemProps> = (props) => {
  const { onDeselect, onSelect, selected, location } = props;
  const locationLabel = [location.city, location.state, location.country]
    .filter(Boolean)
    .join(', ');

  const handleToggle = useCallback(
    (): void => {
      if (!selected) {
        onSelect?.(location.id);
      } else {
        onDeselect?.();
      }
    },
    [
      onDeselect,
      onSelect,
      selected,
      location
    ]
  );

  return (
    <Stack component="li">
      <ButtonBase
        sx={{
          alignItems: 'center',
          justifyContent: 'flex-start',
          p: 2,
          textAlign: 'left',
          width: '100%'
        }}
        onClick={handleToggle}
      >
        <Avatar sx={{ mr: 2 }}>
          <SvgIcon>
            <MarkerPin01Icon />
          </SvgIcon>
        </Avatar>
        <div>
          <Typography>
            {location.name}
          </Typography>
          <Typography
            color="text.secondary"
            variant="body2"
          >
            {locationLabel || 'Location not set'}
          </Typography>
        </div>
      </ButtonBase>
      <Collapse in={selected}>
        <Box sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography
              color="text.secondary"
              variant="caption"
            >
              Contact
            </Typography>
            <Typography variant="body2">
              {location.email}
            </Typography>
          </Stack>
        </Box>
      </Collapse>
    </Stack>
  );
};
