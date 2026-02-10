import { useCallback, useEffect } from 'react';
import type { NextPage } from 'next';
import type { AuthContextType } from '../../../contexts/auth/auth0-context';
import { GuestGuard } from '../../../guards/guest-guard';
import { IssuerGuard } from '../../../guards/issuer-guard';
import { useAuth } from '../../../hooks/use-auth';
import { paths } from '../../../paths';
import { Issuer } from '../../../utils/auth';

const Page: NextPage = () => {
  const { loginWithRedirect } = useAuth<AuthContextType>();

  const handle = useCallback(
    async () => {
      const searchParams = new URLSearchParams(globalThis.location.search);
      const returnTo = searchParams.get('returnTo');
      await loginWithRedirect({
        returnTo: returnTo || paths.dashboard.index
      });
    },
    [loginWithRedirect]
  );

  useEffect(
    () => {
      handle();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return null;
};

Page.getLayout = (page) => (
  <IssuerGuard issuer={Issuer.Auth0}>
    <GuestGuard>
      {page}
    </GuestGuard>
  </IssuerGuard>
);

export default Page;
