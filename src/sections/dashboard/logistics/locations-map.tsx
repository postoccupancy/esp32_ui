import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapRef, ViewState } from 'react-map-gl';
import Map, { Marker } from 'react-map-gl';
import type { FlyToOptions } from 'mapbox-gl';
import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { mapboxConfig } from '../../../config';
import type { Location } from '../../../types/location';

// Map default view state
const VIEW_STATE: Pick<ViewState, 'latitude' | 'longitude' | 'zoom'> = {
  latitude: 40.74281576586265,
  longitude: -73.99277240443942,
  zoom: 11
};

interface LocationsMapProps {
  currentLocationId?: string;
  onLocationSelect?: (locationId: string) => void;
  locations?: Location[];
}

export const LocationsMap: FC<LocationsMapProps> = (props) => {
  const { onLocationSelect, currentLocationId, locations = [] } = props;
  const locationsWithCoords = locations.filter(
    (location) => typeof location.latitude === 'number' && typeof location.longitude === 'number'
  );
  const theme = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [viewState] = useState(() => {
    if (!currentLocationId) {
      return VIEW_STATE;
    } else {
      const location = locationsWithCoords.find((item) => item.id === currentLocationId);

      if (!location) {
        return VIEW_STATE;
      } else {
        return {
          latitude: location.latitude as number,
          longitude: location.longitude as number,
          zoom: 13
        };
      }
    }
  });

  const handleRecenter = useCallback(
    () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      let flyOptions: FlyToOptions;

      const location = locationsWithCoords.find((item) => item.id === currentLocationId);

      if (!location) {
        flyOptions = {
          center: [VIEW_STATE.longitude, VIEW_STATE.latitude]
        };
      } else {
        flyOptions = {
          center: [location.longitude as number, location.latitude as number]
        };
      }

      map.flyTo(flyOptions);
    },
    [locationsWithCoords, currentLocationId]
  );

  // Recenter if locations or current selection change
  useEffect(
    () => {
      handleRecenter();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationsWithCoords, currentLocationId]
  );

  const mapStyle = theme.palette.mode === 'dark'
    ? 'mapbox://styles/mapbox/dark-v9'
    : 'mapbox://styles/mapbox/light-v9';

  if (!mapboxConfig.apiKey) {
    return (
      <Box
        sx={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center'
        }}
      >
        <Box sx={{ mb: 3 }}>
          <Box
            component="img"
            src="/assets/errors/error-404.png"
            sx={{
              width: 200,
              maxWidth: '100%'
            }}
          />
        </Box>
        <Typography
          variant="h5"
          sx={{ mb: 1 }}
        >
          Map cannot be loaded
        </Typography>
        <Typography
          color="text.secondary"
          variant="subtitle2"
        >
          Mapbox API Key is not configured.
        </Typography>
      </Box>
    );
  }

  return (
    <Map
      attributionControl={false}
      initialViewState={viewState}
      mapStyle={mapStyle}
      mapboxAccessToken={mapboxConfig.apiKey}
      ref={mapRef}
      maxZoom={20}
      minZoom={11}
    >
      {locationsWithCoords.map((location) => (
        <Marker
          key={location.id}
          latitude={location.latitude as number}
          longitude={location.longitude as number}
          onClick={() => onLocationSelect?.(location.id)}
        >
          <Box
            sx={{
              height: 50,
              width: 50,
              ...(location.id === currentLocationId && {
                filter: (theme) => `drop-shadow(0px 0px 8px ${theme.palette.primary.main})`
              }),
              '& img': {
                height: '100%'
              }
            }}
          >
            <img src="/assets/car-marker.png" />
          </Box>
        </Marker>
      ))}
    </Map>
  );
};

LocationsMap.propTypes = {
  currentLocationId: PropTypes.string,
  onLocationSelect: PropTypes.func,
  locations: PropTypes.array
};
