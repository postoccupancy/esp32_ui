import type { FC, ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { useSettings } from '../../hooks/use-settings';
import { HorizontalLayout } from './horizontal-layout';
import { VerticalLayout } from './vertical-layout';
import type { Section } from './config';
import { getSections } from './config';
import { withAuthGuard } from '../../hocs/with-auth-guard';

const useTranslatedSections = (): Section[] => {
  const { t } = useTranslation();

  return useMemo(
    () => getSections(t),
    [t]
  );
};

interface LayoutProps {
  children?: ReactNode;
}

export const Layout: FC<LayoutProps> = withAuthGuard((props) => {
  const settings = useSettings();
  const sections = useTranslatedSections();

  if (settings.layout === 'horizontal') {
    return (
      <HorizontalLayout
        sections={sections}
        navColor={settings.navColor}
        {...props}
      />
    );
  }

  return (
    <VerticalLayout
      sections={sections}
      navColor={settings.navColor}
      {...props}
    />
  );
});

Layout.propTypes = {
  children: PropTypes.node
};
