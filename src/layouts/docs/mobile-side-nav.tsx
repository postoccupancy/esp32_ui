import type { FC } from 'react';
import { usePathname } from 'next/navigation';
import PropTypes from 'prop-types';
import { Drawer, Stack } from '@mui/material';
import { Scrollbar } from '../../components/scrollbar';
import type { Section } from './config';
import { SideNavSection } from './side-nav-section';

const SIDE_NAV_WIDTH: number = 280;

interface MobileSideNavProps {
  onClose?: () => void;
  open?: boolean;
  sections?: Section[];
}

export const MobileSideNav: FC<MobileSideNavProps> = (props) => {
  const { onClose, open, sections = [] } = props;
  const pathname = usePathname();

  return (
    <Drawer
      anchor="left"
      onClose={onClose}
      open={open}
      PaperProps={{
        sx: {
          width: `${SIDE_NAV_WIDTH}px`,
          zIndex: 100
        }
      }}
      variant="temporary"
    >
      <Scrollbar
        sx={{
          height: '100%',
          '& .simplebar-content': {
            height: '100%'
          }
        }}
      >
        <Stack
          component="nav"
          spacing={3}
          sx={{ p: 2 }}
        >
          {sections.map((section, index) => (
            <SideNavSection
              items={section.items}
              key={index}
              pathname={pathname}
              subheader={section.subheader}
            />
          ))}
        </Stack>
      </Scrollbar>
    </Drawer>
  );
};

MobileSideNav.propTypes = {
  onClose: PropTypes.func,
  open: PropTypes.bool,
  sections: PropTypes.array
};
