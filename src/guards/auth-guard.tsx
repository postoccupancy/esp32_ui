import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PropTypes from 'prop-types';
import { useAuth } from '../hooks/use-auth';
import { paths } from '../paths';
import { Issuer } from '../utils/auth';

const loginPaths: Record<Issuer, string> = {
  [Issuer.Amplify]: paths.auth.amplify.login,
  [Issuer.Auth0]: paths.auth.auth0.login,
  [Issuer.Firebase]: paths.auth.firebase.login,
  [Issuer.JWT]: paths.auth.jwt.login
};

interface AuthGuardProps {
  children: ReactNode;
}

export const AuthGuard: FC<AuthGuardProps> = (props) => {
  const { children } = props;
  const router = useRouter();
  const { isAuthenticated, issuer } = useAuth();
  const [checked, setChecked] = useState(false);

  const check = useCallback(
    () => {
      if (!isAuthenticated) {
        const searchParams = new URLSearchParams({ returnTo: globalThis.location.href }).toString();
        const href = loginPaths[issuer as Issuer] + `?${searchParams}`;
        router.replace(href);
      } else {
        setChecked(true);
      }
    },
    [isAuthenticated, issuer, router]
  );

  // Only check on mount, this allows us to redirect the user manually when auth state changes
  useEffect(
    () => {
      check();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (!checked) {
    return null;
  }

  // If got here, it means that the redirect did not occur, and that tells us that the user is
  // authenticated / authorized.

  return <>{children}</>;
};

AuthGuard.propTypes = {
  children: PropTypes.node
};
