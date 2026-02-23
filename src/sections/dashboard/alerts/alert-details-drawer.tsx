import type { ChangeEvent, FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import XIcon from '@untitled-ui/icons-react/build/esm/X';
import type { Theme } from '@mui/material';
import {
  Box,
  Button,
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
import { format } from 'date-fns';
import type { Alert } from '../../../types/alert';

interface AlertDetailsDrawerProps {
  alert?: Alert | null;
  container?: HTMLDivElement | null;
  onClose?: () => void;
  onSave?: (alertId: string, updates: Partial<Alert>) => void;
  open?: boolean;
}

type EditForm = {
  title: string;
  description: string;
  severity: Alert['severity'];
  status: Alert['status'];
  threshold: string;
};

export const AlertDetailsDrawer: FC<AlertDetailsDrawerProps> = (props) => {
  const {
    alert,
    container,
    onClose,
    onSave,
    open = false,
    ...other
  } = props;
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const desktopDrawerWidth = 420;
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

    return format(alert.createdAt, 'MMM dd, yyyy HH:mm:ss');
  }, [alert]);

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
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
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
                  Value
                </Typography>
                <Typography variant="body2">
                  {typeof alert.value === 'number'
                    ? `${alert.value}${alert.unit ? ` ${alert.unit}` : ''}`
                    : 'N/A'}
                </Typography>
              </Box>
              <Box>
                <Typography color="text.secondary"
variant="overline">
                  Created At
                </Typography>
                <Typography variant="body2">
                  {createdAt}
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
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.enteringScreen,
            easing: theme.transitions.easing.easeOut
          }),
          width: open ? desktopDrawerWidth : 0
        })}
      >
        <Box
          sx={{
            backgroundColor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 2.5,
            boxShadow: 24,
            height: 'calc(100% - 32px)',
            mt: 2,
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

AlertDetailsDrawer.propTypes = {
  // @ts-ignore
  alert: PropTypes.object,
  container: PropTypes.any,
  onClose: PropTypes.func,
  onSave: PropTypes.func,
  open: PropTypes.bool
};
