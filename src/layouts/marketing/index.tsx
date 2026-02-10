import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { usePathname } from 'next/navigation';
import type { Theme } from '@mui/material';
import { useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Footer } from './footer';
import { SideNav } from './side-nav';
import { TopNav } from './top-nav';

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

const LayoutRoot = styled('div')(
  ({ theme }) => ({
    backgroundColor: theme.palette.background.default,
    height: '100%'
  })
);

interface LayoutProps {
  children?: ReactNode;
}

export const Layout: FC<LayoutProps> = (props) => {
  const { children } = props;
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const mobileNav = useMobileNav();

  return (
    <>
      <TopNav onMobileNavOpen={mobileNav.handleOpen} />
      {!lgUp && (
        <SideNav
          onClose={mobileNav.handleClose}
          open={mobileNav.isOpen}
        />
      )}
      <LayoutRoot>
        {children}
        <Footer />
      </LayoutRoot>
    </>
  );
};

Layout.propTypes = {
  children: PropTypes.node
};
