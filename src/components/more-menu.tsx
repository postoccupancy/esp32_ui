import type { FC } from 'react';
import { useCallback, useRef, useState } from 'react';
import ArchiveIcon from '@untitled-ui/icons-react/build/esm/Archive';
import ClipboardIcon from '@untitled-ui/icons-react/build/esm/Clipboard';
import DotsHorizontalIcon from '@untitled-ui/icons-react/build/esm/DotsHorizontal';
import Download01Icon from '@untitled-ui/icons-react/build/esm/Download01';
import FileCheck03Icon from '@untitled-ui/icons-react/build/esm/FileCheck03';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SvgIcon,
  Tooltip
} from '@mui/material';

export const MoreMenu: FC = (props) => {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<boolean>(false);

  const handleMenuOpen = useCallback(
    (): void => {
      setOpenMenu(true);
    },
    []
  );

  const handleMenuClose = useCallback(
    (): void => {
      setOpenMenu(false);
    },
    []
  );

  const handleAction = useCallback(
    (): void => {
      setOpenMenu(false);
    },
    []
  );

  return (
    <>
      <Tooltip title="More options">
        <IconButton
          onClick={handleMenuOpen}
          ref={anchorRef}
          {...props}
        >
          <SvgIcon>
            <DotsHorizontalIcon />
          </SvgIcon>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorRef.current}
        anchorOrigin={{
          horizontal: 'right',
          vertical: 'bottom'
        }}
        onClose={handleMenuClose}
        open={openMenu}
        PaperProps={{
          sx: {
            maxWidth: '100%',
            width: 200
          }
        }}
        transformOrigin={{
          horizontal: 'right',
          vertical: 'top'
        }}
      >
        <MenuItem onClick={handleAction}>
          <ListItemIcon>
            <SvgIcon>
              <Download01Icon />
            </SvgIcon>
          </ListItemIcon>
          <ListItemText primary="Import" />
        </MenuItem>
        <MenuItem onClick={handleAction}>
          <ListItemIcon>
            <SvgIcon>
              <FileCheck03Icon />
            </SvgIcon>
          </ListItemIcon>
          <ListItemText primary="Export" />
        </MenuItem>
        <MenuItem onClick={handleAction}>
          <ListItemIcon>
            <SvgIcon>
              <ClipboardIcon />
            </SvgIcon>
          </ListItemIcon>
          <ListItemText primary="Copy" />
        </MenuItem>
        <MenuItem onClick={handleAction}>
          <ListItemIcon>
            <SvgIcon>
              <ArchiveIcon />
            </SvgIcon>
          </ListItemIcon>
          <ListItemText primary="Archive" />
        </MenuItem>
      </Menu>
    </>
  );
};
