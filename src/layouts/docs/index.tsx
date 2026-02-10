import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Theme } from '@mui/material';
import { useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
import { sections } from './config';
import { MobileSideNav } from './mobile-side-nav';
import { DesktopSideNav } from './desktop-side-nav';
import { TopNav } from './top-nav';

const SIDE_NAV_WIDTH: number = 280;

const useMobileNav = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const handlePathnameChange = useCallback(
    (): void => {
      if (isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen]
  );

  useEffect(
    () => {
      handlePathnameChange();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname]
  );

  const handleOpen = useCallback(
    (): void => {
      setIsOpen(true);
    },
    []
  );

  const handleClose = useCallback(
    (): void => {
      setIsOpen(false);
    },
    []
  );

  return {
    isOpen,
    handleOpen,
    handleClose
  };
};

interface LayoutProps {
  children: ReactNode;
}

const LayoutRoot = styled('div')(
  ({ theme }) => ({
    display: 'flex',
    flex: '1 1 auto',
    maxWidth: '100%',
    [theme.breakpoints.up('lg')]: {
      paddingLeft: SIDE_NAV_WIDTH
    }
  })
);

const LayoutContainer = styled('div')({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  width: '100%'
});

export const Layout: FC<LayoutProps> = (props) => {
  const { children } = props;
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const mobileNav = useMobileNav();

  return (
    <>
      <TopNav onMobileNavOpen={mobileNav.handleOpen} />
      {
        lgUp
          ? <DesktopSideNav sections={sections} />
          : (
            <MobileSideNav
              onClose={mobileNav.handleClose}
              open={mobileNav.isOpen}
              sections={sections}
            />
          )
      }
      <LayoutRoot>
        <LayoutContainer>
          {children}
        </LayoutContainer>
      </LayoutRoot>
    </>
  );
};
