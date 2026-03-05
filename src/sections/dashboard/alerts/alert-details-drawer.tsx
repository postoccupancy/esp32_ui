/* eslint-disable react/jsx-max-props-per-line */
import type { ChangeEvent, FC } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import XIcon from '@untitled-ui/icons-react/build/esm/X';
import type { Theme } from '@mui/material';
import {
  Box,
  Button,
  Card,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  SvgIcon,
  TextField,
  Typography,
  useMediaQuery
} from '@mui/material';
import type { Alert } from '../../../types/alert';
import { TimeSeriesChart } from '../../../pages/components/time-series';

interface AlertDetailsDrawerProps {
  alert?: Alert | null;
  container?: HTMLDivElement | null;
  onClose?: () => void;
  onSave?: (alertId: string, updates: Partial<Alert>) => void;
  open?: boolean;
  normalizeDeviation?: boolean;
  thresholdBandVisibility?: { temp: boolean; rh: boolean; moisture: boolean };
  desktopInitialOffsetTop?: number;
}

type EditForm = {
  title: string;
  description: string;
  severity: Alert['severity'];
  status: Alert['status'];
  threshold: string;
};
const toAbsoluteHumidity = (tempF: number, rh: number): number | null => {
  const tempC = (tempF - 32) * (5 / 9);
  const saturationVp = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  const absoluteHumidity = (saturationVp * rh * 2.1674) / (273.15 + tempC);
  return Number.isFinite(absoluteHumidity) ? absoluteHumidity : null;
};

const AlertDetailsDrawerComponent: FC<AlertDetailsDrawerProps> = (props) => {
  const {
    alert,
    container,
    onClose,
    onSave,
    open = false,
    normalizeDeviation = false,
    thresholdBandVisibility = { temp: true, rh: true, moisture: true },
    desktopInitialOffsetTop = 80,
    ...other
  } = props;
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const desktopDrawerWidth = 420;
  const desktopDrawerGap = 32;
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formState, setFormState] = useState<EditForm>({
    title: '',
    description: '',
    severity: 'info',
    status: 'open',
    threshold: ''
  });

  useEffect(() => {
    if (!alert) {
      return;
    }

    setIsEditing(false);
    setFormState({
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      status: alert.status,
      threshold: alert.threshold ?? ''
    });
  }, [alert]);

  const createdAt = useMemo(() => {
    if (!alert) {
      return '';
    }

    return new Date(alert.createdAt).toLocaleString();
  }, [alert]);

  const startEnd = useMemo(() => {
    if (!alert?.startAt || !alert?.endAt) return '';
    const startLabel = new Date(alert.startAt).toLocaleString();
    if (alert.isActive) {
      const endDateLabel = new Date(alert.endAt).toLocaleDateString();
      return `${startLabel} — ${endDateLabel}, now`;
    }
    return `${startLabel} — ${new Date(alert.endAt).toLocaleString()}`;
  }, [alert]);

  const displayValue = useMemo(() => {
    if (!alert || typeof alert.value !== 'number') {
      return 'N/A';
    }

    if (alert.unit === 'duration') {
      const liveSeconds = alert.isActive && alert.startAt
        ? Math.round((Date.now() - alert.startAt) / 1000)
        : Math.round(alert.value);
      const totalSeconds = Math.max(0, liveSeconds);
      const totalMinutes = Math.round(totalSeconds / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }

    return `${alert.value}${alert.unit ? ` ${alert.unit}` : ''}`;
  }, [alert]);

  const previewTimeSeries = useMemo(() => {
    const preview = alert?.preview;
    if (!preview) return null;

    const tempValues = preview.temp.values;
    const tempBaselines = preview.temp.baselines;
    const rhValues = preview.rh.values;
    const rhBaselines = preview.rh.baselines;

    const expectedRh = rhValues.map((_, i) => {
      const temp = tempValues[i];
      const tempBase = tempBaselines[i];
      const rhBase = rhBaselines[i];
      if (typeof temp !== 'number' || typeof tempBase !== 'number' || tempBase === 0 || typeof rhBase !== 'number') {
        return null;
      }
      const tempDeviationRatio = (temp - tempBase) / tempBase;
      const expected = rhBase * (1 - tempDeviationRatio);
      return Number.isFinite(expected) ? expected : null;
    });

    const moistureValues = tempValues.map((temp, i) => {
      const rh = rhValues[i];
      if (typeof temp !== 'number' || typeof rh !== 'number') return null;
      return toAbsoluteHumidity(temp, rh);
    });
    const moistureBaselines = tempBaselines.map((tempBase, i) => {
      const rhBase = rhBaselines[i];
      if (typeof tempBase !== 'number' || typeof rhBase !== 'number') return null;
      return toAbsoluteHumidity(tempBase, rhBase);
    });

    const expectedBaselineForNormalized = expectedRh;

    return {
      tooltipCategories: preview.categories,
      chartSeries: [
        { name: 'Temperature (°F)', data: tempValues },
        { name: 'Relative Humidity (%)', data: rhValues },
        { name: 'Expected RH (%)', data: expectedRh },
        { name: 'Moisture (g/m³)', data: moistureValues },
      ],
      overlaySeries: [
        { name: 'Temperature Baseline (30d hour-of-day)', data: tempBaselines },
        {
          name: normalizeDeviation
            ? 'Expected RH Baseline for Observed RH (%)'
            : 'RH Baseline (30d hour-of-day, %)',
          data: normalizeDeviation ? expectedBaselineForNormalized : rhBaselines,
        },
        {
          name: 'Expected RH Baseline (%)',
          data: normalizeDeviation ? expectedBaselineForNormalized : rhBaselines,
        },
        { name: 'Moisture Baseline (g/m³)', data: moistureBaselines },
      ],
    };
  }, [alert?.preview, normalizeDeviation]);

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFormState((prevState) => ({
      ...prevState,
      [event.target.name]: event.target.value
    }));
  };

  const handleSeverityChange = (event: any) => {
    setFormState((prevState) => ({
      ...prevState,
      severity: event.target.value as Alert['severity']
    }));
  };

  const handleStatusChange = (event: any) => {
    setFormState((prevState) => ({
      ...prevState,
      status: event.target.value as Alert['status']
    }));
  };

  const handleSave = () => {
    if (!alert) {
      return;
    }

    onSave?.(alert.id, {
      title: formState.title,
      description: formState.description,
      severity: formState.severity,
      status: formState.status,
      threshold: formState.threshold || undefined
    });
    setIsEditing(false);
  };

  const content = (
    <>
      <Stack
        alignItems="center"
        direction="row"
        justifyContent="space-between"
        spacing={2}
        sx={{ p: 3 }}
      >
        <Typography variant="h6">
          Alert Details
        </Typography>
        <IconButton onClick={onClose}>
          <SvgIcon>
            <XIcon />
          </SvgIcon>
        </IconButton>
      </Stack>
      <Divider />
      {!alert ? (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary"
variant="body2">
            Select an alert to view details.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={3}
sx={{ p: 3 }}>
          {isEditing ? (
            <>
              <TextField
                fullWidth
                label="Title"
                name="title"
                onChange={handleTextChange}
                value={formState.title}
              />
              <TextField
                fullWidth
                label="Description"
                multiline
                minRows={3}
                name="description"
                onChange={handleTextChange}
                value={formState.description}
              />
              <FormControl fullWidth>
                <InputLabel id="alert-severity-label">Severity</InputLabel>
                <Select
                  label="Severity"
                  labelId="alert-severity-label"
                  onChange={handleSeverityChange}
                  value={formState.severity}
                >
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="slight">Slight</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="moderate">Moderate</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="extreme">Extreme</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="alert-status-label">Status</InputLabel>
                <Select
                  label="Status"
                  labelId="alert-status-label"
                  onChange={handleStatusChange}
                  value={formState.status}
                >
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="acknowledged">Acknowledged</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                  <MenuItem value="short">Short</MenuItem>
                  <MenuItem value="sustained">Sustained</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Threshold"
                name="threshold"
                onChange={handleTextChange}
                value={formState.threshold}
              />
              <Stack direction="row"
spacing={1}>
                <Button onClick={handleSave}
variant="contained">
                  Save
                </Button>
                <Button onClick={() => setIsEditing(false)}
variant="outlined">
                  Cancel
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Box>
                {previewTimeSeries && (
                  <Card sx={{ p: 1 }}>
                    <TimeSeriesChart
                      chartHeight={220}
                      chartSeries={previewTimeSeries.chartSeries}
                      overlaySeries={previewTimeSeries.overlaySeries}
                      showOverlayLines={false}
                      equalizeThresholdBands
                      normalizeDeviation={normalizeDeviation}
                      tooltipCategories={previewTimeSeries.tooltipCategories}
                      showLegend={false}
                      showXAxisLabels={false}
                      thresholdBandCenterSeries={{
                        rhExpected: 2,
                      }}
                      thresholdBandVisibility={{
                        temp: thresholdBandVisibility.temp,
                        rhObserved: false,
                        rhExpected: thresholdBandVisibility.rh,
                        rhExpectedBaseline: false,
                        moisture: thresholdBandVisibility.moisture,
                      }}
                    />
                  </Card>
                )}
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Title
                </Typography>
                <Typography variant="subtitle1">
                  {alert.title}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Description
                </Typography>
                <Typography variant="body2">
                  {alert.description}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Category / Severity / Status
                </Typography>
                <Typography variant="body2">
                  {`${alert.category} / ${alert.severity} / ${alert.status}`}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Location
                </Typography>
                <Typography variant="body2">
                  {`${alert.locationName}${alert.sensorId ? ` (${alert.sensorId})` : ''}`}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Threshold
                </Typography>
                <Typography variant="body2">
                  {alert.threshold ?? 'N/A'}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Duration
                </Typography>
                <Typography variant="body2">
                  {displayValue}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Start / End
                </Typography>
                <Typography variant="body2">
                  {startEnd || createdAt}
                </Typography>
              </Box>
              <Button onClick={() => setIsEditing(true)}
variant="contained">
                Edit
              </Button>
            </>
          )}
        </Stack>
      )}
    </>
  );

  if (lgUp) {
    return (
      <Box
        sx={(theme) => ({
          flex: '0 0 auto',
          overflow: 'hidden',
          position: 'sticky',
          top: 80,
          mt: `${Math.max(0, desktopInitialOffsetTop)}px`,
          alignSelf: 'flex-start',
          maxHeight: `calc(100vh - 40px - ${Math.max(0, desktopInitialOffsetTop)}px)`,
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.enteringScreen,
            easing: theme.transitions.easing.easeOut
          }),
          width: open ? desktopDrawerWidth + desktopDrawerGap : 0
        })}
      >
        <Box
          sx={{
            backgroundColor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 2.5,
            boxShadow: 24,
            maxHeight: `calc(100vh - 40px - ${Math.max(0, desktopInitialOffsetTop)}px)`,
            ml: `${desktopDrawerGap}px`,
            overflow: 'auto',
            width: desktopDrawerWidth
          }}
          {...other}
        >
          {content}
        </Box>
      </Box>
    );
  }

  return (
    <Drawer
      anchor="right"
      hideBackdrop
      ModalProps={{
        container,
        sx: {
          pointerEvents: 'none',
          position: 'absolute'
        }
      }}
      onClose={onClose}
      open={open}
      PaperProps={{
        sx: {
          maxWidth: '100%',
          pointerEvents: 'auto',
          position: 'absolute',
          width: { xs: '100%', sm: 420 }
        }
      }}
      SlideProps={{ container }}
      variant="temporary"
      {...other}
    >
      {content}
    </Drawer>
  );
};

AlertDetailsDrawerComponent.propTypes = {
  alert: PropTypes.any,
  container: PropTypes.any,
  onClose: PropTypes.func,
  onSave: PropTypes.func,
  open: PropTypes.bool,
  normalizeDeviation: PropTypes.bool,
};

export const AlertDetailsDrawer = memo(AlertDetailsDrawerComponent);
AlertDetailsDrawer.displayName = 'AlertDetailsDrawer';
