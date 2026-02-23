import type { FC } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import Bell01Icon from '@untitled-ui/icons-react/build/esm/Bell01';
import Mail04Icon from '@untitled-ui/icons-react/build/esm/Mail04';
import XIcon from '@untitled-ui/icons-react/build/esm/X';
import {
  Avatar,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Popover,
  Stack,
  SvgIcon,
  Tooltip,
  Typography
} from '@mui/material';
import NextLink from 'next/link';
import { Scrollbar } from '../../../components/scrollbar';
import type { Notification } from './notifications';

interface NotificationsPopoverProps {
  anchorEl: null | Element;
  notifications: Notification[];
  onClose?: () => void;
  onMarkAllAsRead?: () => void;
  onRemoveOne?: (id: string) => void;
  open?: boolean;
}

export const NotificationsPopover: FC<NotificationsPopoverProps> = (props) => {
  const {
    anchorEl,
    notifications,
    onClose,
    onMarkAllAsRead,
    onRemoveOne,
    open = false,
    ...other
  } = props;

  const isEmpty = notifications.length === 0;

  return (
    <Popover
      anchorEl={anchorEl}
      anchorOrigin={{
        horizontal: 'left',
        vertical: 'bottom'
      }}
      disableScrollLock
      onClose={onClose}
      open={open}
      PaperProps={{ sx: { width: 380 } }}
      {...other}
    >
      <Stack
        alignItems="center"
        direction="row"
        justifyContent="space-between"
        spacing={2}
        sx={{
          px: 3,
          py: 2
        }}
      >
        <Typography
          color="inherit"
          variant="h6"
        >
          Notifications
        </Typography>
        <Tooltip title="Mark all as read">
          <IconButton
            onClick={onMarkAllAsRead}
            size="small"
            color="inherit"
          >
            <SvgIcon>
              <Mail04Icon />
            </SvgIcon>
          </IconButton>
        </Tooltip>
      </Stack>
      {
        isEmpty
          ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2">
                There are no notifications
              </Typography>
            </Box>
          )
          : (
            <Scrollbar sx={{ maxHeight: 400 }}>
              <List disablePadding>
                {notifications.map((notification) => (
                  <ListItem
                    divider
                    key={notification.id}
                    sx={{
                      alignItems: 'flex-start',
                      '&:hover': {
                        backgroundColor: 'action.hover'
                      },
                      '& .MuiListItemSecondaryAction-root': {
                        top: '24%'
                      }
                    }}
                    secondaryAction={(
                      <Tooltip title="Remove">
                        <IconButton
                          edge="end"
                          onClick={() => onRemoveOne?.(notification.id)}
                          size="small"
                        >
                          <SvgIcon>
                            <XIcon />
                          </SvgIcon>
                        </IconButton>
                      </Tooltip>
                    )}
                  >
                    <ListItemAvatar sx={{ mt: 0.5 }}>
                      <Avatar
                        sx={{
                          bgcolor: notification.type === 'environment'
                            ? 'warning.main'
                            : 'error.main'
                        }}
                      >
                        <SvgIcon>
                          <Bell01Icon />
                        </SvgIcon>
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={(
                        <Stack spacing={0.5}>
                          <Typography variant="subtitle2">
                            {notification.title}
                          </Typography>
                          <Typography
                            color="text.secondary"
                            variant="body2"
                          >
                            {notification.description}
                          </Typography>
                          <Typography
                            color="text.secondary"
                            variant="caption"
                          >
                            {format(notification.createdAt, 'MMM dd, h:mm a')}
                          </Typography>
                        </Stack>
                      )}
                      sx={{ my: 0 }}
                    />
                    <Button
                      component={NextLink}
                      href={`/dashboard/alerts?category=${notification.category ?? notification.type}&status=open&alertId=${notification.alertId ?? notification.id}`}
                      onClick={onClose}
                      size="small"
                      sx={{ ml: 1, minWidth: 'auto', px: 1 }}
                      variant="text"
                    >
                      Open
                    </Button>
                  </ListItem>
                ))}
              </List>
            </Scrollbar>
          )
      }
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          p: 1.5
        }}
      >
        <Button
          component={NextLink}
          fullWidth
          href="/dashboard/alerts"
          onClick={onClose}
          size="small"
          variant="outlined"
        >
          View All Alerts
        </Button>
      </Box>
    </Popover>
  );
};

NotificationsPopover.propTypes = {
  anchorEl: PropTypes.any,
  notifications: PropTypes.array.isRequired,
  onClose: PropTypes.func,
  onMarkAllAsRead: PropTypes.func,
  onRemoveOne: PropTypes.func,
  open: PropTypes.bool
};
