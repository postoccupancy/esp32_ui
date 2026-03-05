import type { FC } from 'react';
import PropTypes from 'prop-types';
import type { ApexOptions } from 'apexcharts';
import numeral from 'numeral';
import ChevronDownIcon from '@untitled-ui/icons-react/build/esm/ChevronDown';
import ChevronUpIcon from '@untitled-ui/icons-react/build/esm/ChevronUp';
import DotsHorizontalIcon from '@untitled-ui/icons-react/build/esm/DotsHorizontal';
import type { SxProps } from '@mui/system';
import { Box, Card, CardHeader, IconButton, Stack, SvgIcon, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Chart } from '../../../components/chart';

const logoMap: Record<string, string> = {
  BTC: '/assets/logos/logo-bitcoin.svg',
  ETH: '/assets/logos/logo-eth.svg',
  BNB: '/assets/logos/logo-bnb.svg'
};

// const useChartOptions = (color: string): ApexOptions => {
//   const theme = useTheme();

//   return {
//     chart: {
//       background: 'transparent',
//       toolbar: {
//         show: false
//       },
//       zoom: {
//         enabled: false
//       }
//     },
//     colors: [color],
//     dataLabels: {
//       enabled: false
//     },
//     fill: {
//       gradient: {
//         opacityFrom: 0.5,
//         opacityTo: 0,
//         stops: [0, 100]
//       },
//       type: 'gradient'
//     },
//     grid: {
//       show: false,
//       padding: {
//         bottom: 0,
//         left: 0,
//         right: 0,
//         top: 0
//       }
//     },
//     stroke: {
//       width: 2
//     },
//     theme: {
//       mode: theme.palette.mode
//     },
//     tooltip: {
//       enabled: false
//     },
//     xaxis: {
//       axisBorder: {
//         show: false
//       },
//       axisTicks: {
//         show: false
//       },
//       labels: {
//         show: false
//       }
//     },
//     yaxis: {
//       show: false
//     }
//   };
// };

// type ChartSeries = {
//   name: string;
//   data: number[];
// }[];

interface MetricCardProps {
  chartColor: string;
  // chartSeries: ChartSeries;
  mainAmount: string;
  mainLabel: string;
  rate: number;
  sx?: SxProps;
  min: string;
  max: string;
}

export const MetricCard: FC<MetricCardProps> = (props) => {
  const { mainAmount, 
    // chartColor, 
    // chartSeries, 
    mainLabel, rate, min, max, sx } = props;
  // const chartOptions = useChartOptions(chartColor);
  // const formattedMinValue = numeral(min).format('0°,0.0');
  // const formattedMaxValue = numeral(max).format('0°,0.0');
  const logo = logoMap[mainLabel];
  const rateColor = rate < 0 ? 'error.main' : 'success.main';
  const rateIcon = rate < 0 ? <ChevronDownIcon /> : <ChevronUpIcon />;

  return (
    <Card sx={sx}>
      <CardHeader
        action={null}
        
        sx={{ pb: 0, pt: "24px" }}
        title={(
        <Stack
          alignItems="flex-end"
          direction="row"
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          <Typography
            color="text.secondary"
            variant="h6"
            sx={{ lineHeight: 1 }}
          >
            <Typography
              color="text.primary"
              component="span"
              variant="inherit"
            >
              {mainAmount}
            </Typography>
            {' '}
            {mainLabel}
          </Typography>    
          <Stack
            alignItems="center"
            direction="row"
            sx={{ 
              color: rateColor,
              position: 'relative',
              top: "5px"
            }}
            spacing={0.25}
          >
            <SvgIcon
              color="inherit"
              fontSize="small"
            >
              {rateIcon}
            </SvgIcon>
            <Typography
              color="inherit"
              variant="body2"
            >
              {rate}%
            </Typography>
          </Stack>
        </Stack>                
        )}
        subheader={
          <Typography 
            variant="body2" 
            color="text.secondary"
            sx={{ lineHeight: 1 }}
            >
            {`${min} — ${max}`}
          </Typography>
        }
      />
      {/* <Chart
        height={140}
        options={chartOptions}
        series={chartSeries}
        type="area"
      /> */}
      <Box
        sx={{
          pb: 3,
          px: 2
        }}
      >
        {/* <Stack
          alignItems="center"
          direction="row"
          spacing={2}
        >
          <Box
            component="img"
            src={logo}
            sx={{ flex: '0 0 auto' }}
          />
          <div>
            <Typography variant="subtitle2">
              {mainLabel}/USD
            </Typography>
            <Stack
              alignItems="center"
              direction="row"
              sx={{ color: rateColor }}
              spacing={0.5}
            >
              <SvgIcon
                color="inherit"
                fontSize="small"
              >
                {rateIcon}
              </SvgIcon>
              <Typography
                color="inherit"
                variant="body2"
              >
                {rate}%
              </Typography>
            </Stack>
          </div>
        </Stack> */}
      </Box>
    </Card>
  );
};

MetricCard.propTypes = {
  chartColor: PropTypes.string.isRequired,
  // chartSeries: PropTypes.array.isRequired,
  mainAmount: PropTypes.string.isRequired,
  mainLabel: PropTypes.string.isRequired,
  rate: PropTypes.number.isRequired,
  // @ts-ignore
  sx: PropTypes.object,
  min: PropTypes.string.isRequired,
  max: PropTypes.string.isRequired
};
