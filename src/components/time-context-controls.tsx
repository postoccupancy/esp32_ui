import type { FC } from 'react';
import { FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { useTimeContext } from '../contexts/time-context';

const presetOptions = [
  { value: '15m', label: 'Last 15m' },
  { value: '1h', label: 'Last 1h' },
  { value: '6h', label: 'Last 6h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' }
] as const;

const bucketOptions = [
  { value: '2s', label: '2s' },
  { value: '10s', label: '10s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '1h', label: '1h' }
] as const;

interface TimeContextControlsProps {
  showBucket?: boolean;
}

export const TimeContextControls: FC<TimeContextControlsProps> = (props) => {
  const { showBucket = true } = props;
  const { preset, bucket, setPreset, setBucket } = useTimeContext();

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ width: { xs: '100%', md: 'auto' } }}
    >
      <FormControl
        size="small"
        sx={{ minWidth: 140 }}
      >
        <InputLabel id="time-preset-label">Window</InputLabel>
        <Select
          label="Window"
          labelId="time-preset-label"
          value={preset}
          onChange={(event) => setPreset(event.target.value as typeof preset)}
        >
          {presetOptions.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {showBucket && (
        <FormControl
          size="small"
          sx={{ minWidth: 120 }}
        >
          <InputLabel id="time-bucket-label">Bucket</InputLabel>
          <Select
            label="Bucket"
            labelId="time-bucket-label"
            value={bucket}
            onChange={(event) => setBucket(event.target.value as typeof bucket)}
          >
            {bucketOptions.map((option) => (
              <MenuItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Stack>
  );
};
