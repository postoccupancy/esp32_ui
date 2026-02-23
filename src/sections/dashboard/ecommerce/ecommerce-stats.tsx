import type { FC } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
  Unstable_Grid2 as Grid
} from '@mui/material';
import numeral from 'numeral';
import { formatTimePresetLabel, useTimeContext } from '../../../contexts/time-context';

interface EcommerceStatsProps {
  min: number;
  max: number;
  average: number;
}

export const EcommerceStats: FC<EcommerceStatsProps> = (props) => {
  const { min, max, average } = props;
  const { preset } = useTimeContext();

  const formattedCost = `${numeral(max).format('0.0')}°F`;
  const formattedProfit = `${numeral(min).format('0.0')}°F`;
  const formattedSales = `${numeral(average).format('0.0')}°F`;

  return (
    <Card>
      <CardHeader
        title={formatTimePresetLabel(preset)}
        sx={{ pb: 0 }}
      />
      <CardContent>
        <Grid
          container
          spacing={3}
        >
          <Grid
            xs={12}
            md={4}
          >
            <Stack
              alignItems="center"
              direction="row"
              spacing={2}
              sx={{
                backgroundColor: (theme) => theme.palette.mode === 'dark'
                  ? 'neutral.800'
                  : 'error.lightest',
                borderRadius: 2.5,
                px: 3,
                py: 4
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  height: 48,
                  width: 48,
                  '& img': {
                    width: '100%'
                  }
                }}
              >
                <img src="/assets/iconly/iconly-glass-chart.svg" />
              </Box>
              <div>
                <Typography
                  color="text.secondary"
                  variant="body2"
                >
                  Average
                </Typography>
                <Typography variant="h5">
                  {formattedSales}
                </Typography>
              </div>
            </Stack>
          </Grid>
          <Grid
            xs={12}
            md={4}
          >
            <Stack
              alignItems="center"
              direction="row"
              spacing={2}
              sx={{
                backgroundColor: (theme) => theme.palette.mode === 'dark'
                  ? 'neutral.800'
                  : 'warning.lightest',
                borderRadius: 2.5,
                px: 3,
                py: 4
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  height: 48,
                  width: 48,
                  '& img': {
                    width: '100%'
                  }
                }}
              >
                <img src="/assets/iconly/iconly-glass-discount.svg" />
              </Box>
              <div>
                <Typography
                  color="text.secondary"
                  variant="body2"
                >
                  Max
                </Typography>
                <Typography variant="h5">
                  {formattedCost}
                </Typography>
              </div>
            </Stack>
          </Grid>
          <Grid
            xs={12}
            md={4}
          >
            <Stack
              alignItems="center"
              direction="row"
              spacing={2}
              sx={{
                backgroundColor: (theme) => theme.palette.mode === 'dark'
                  ? 'neutral.800'
                  : 'success.lightest',
                borderRadius: 2.5,
                px: 3,
                py: 4
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  height: 48,
                  width: 48,
                  '& img': {
                    width: '100%'
                  }
                }}
              >
                <img src="/assets/iconly/iconly-glass-tick.svg" />
              </Box>
              <div>
                <Typography
                  color="text.secondary"
                  variant="body2"
                >
                  Min
                </Typography>
                <Typography variant="h5">
                  {formattedProfit}
                </Typography>
              </div>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};
