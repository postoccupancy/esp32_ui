import { useCallback, useEffect, useRef, useState } from 'react';
import type { NextPage } from 'next';
import { useSearchParams } from 'next/navigation';
import Head from 'next/head';
import type { Theme } from '@mui/material';
import { Box, Divider, useMediaQuery } from '@mui/material';
import { usePageView } from '../../hooks/use-page-view';
import { Layout as DashboardLayout } from '../../layouts/dashboard';
import { MailComposer } from '../../sections/dashboard/mail/mail-composer';
import { MailThread } from '../../sections/dashboard/mail/mail-thread';
import { MailContainer } from '../../sections/dashboard/mail/mail-container';
import { MailList } from '../../sections/dashboard/mail/mail-list';
import { MailSidebar } from '../../sections/dashboard/mail/mail-sidebar';
import { useDispatch, useSelector } from '../../store';
import { thunks } from '../../thunks/mail';
import type { Label } from '../../types/mail';

const useParams = (): { emailId?: string; label?: string; } => {
  const searchParams = useSearchParams();
  const emailId = searchParams.get('emailId') || undefined;
  const label = searchParams.get('label') || undefined;

  return {
    emailId,
    label
  };
};

const useLabels = (): Label[] => {
  const dispatch = useDispatch();
  const labels = useSelector((state) => state.mail.labels);

  const getLabels = useCallback(
    (): void => {
      dispatch(thunks.getLabels());
    },
    [dispatch]
  );

  useEffect(
    () => {
      getLabels();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return labels;
};

interface ComposerState {
  isFullScreen: boolean;
  isOpen: boolean;
  message: string;
  subject: string;
  to: string;
}

const useComposer = () => {
  const initialState: ComposerState = {
    isFullScreen: false,
    isOpen: false,
    message: '',
    subject: '',
    to: ''
  };

  const [state, setState] = useState<ComposerState>(initialState);

  const handleOpen = useCallback(
    (): void => {
      setState((prevState) => ({
        ...prevState,
        isOpen: true
      }));
    },
    []
  );

  const handleClose = useCallback(
    (): void => {
      setState(initialState);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleMaximize = useCallback(
    (): void => {
      setState((prevState) => ({
        ...prevState,
        isFullScreen: true
      }));
    },
    []
  );

  const handleMinimize = useCallback(
    (): void => {
      setState((prevState) => ({
        ...prevState,
        isFullScreen: false
      }));
    },
    []
  );

  const handleMessageChange = useCallback(
    (message: string): void => {
      setState((prevState) => ({
        ...prevState,
        message
      }));
    },
    []
  );

  const handleSubjectChange = useCallback(
    (subject: string): void => {
      setState((prevState) => ({
        ...prevState,
        subject
      }));
    },
    []
  );

  const handleToChange = useCallback(
    (to: string): void => {
      setState((prevState) => ({
        ...prevState,
        to
      }));
    },
    []
  );

  return {
    ...state,
    handleClose,
    handleMaximize,
    handleMessageChange,
    handleMinimize,
    handleOpen,
    handleSubjectChange,
    handleToChange
  };
};

const useSidebar = () => {
  const mdUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
  const [isOpen, setIsOpen] = useState(mdUp);

  const handleScreenResize = useCallback(
    (): void => {
      if (!mdUp) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    },
    [mdUp]
  );

  useEffect(
    () => {
      handleScreenResize();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mdUp]
  );

  const handleToggle = useCallback(
    (): void => {
      setIsOpen((prevState) => !prevState);
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
    handleToggle,
    handleClose
  };
};

const Page: NextPage = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { emailId, label: currentLabelId } = useParams();
  const labels = useLabels();
  const composer = useComposer();
  const sidebar = useSidebar();

  usePageView();

  const view = emailId ? 'details' : 'list';

  return (
    <>
      <Head>
        <title>
          Dashboard: Mail | Devias Kit PRO
        </title>
      </Head>
      <Divider />
      <Box
        component="main"
        sx={{
          backgroundColor: 'background.paper',
          flex: '1 1 auto',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <Box
          ref={rootRef}
          sx={{
            bottom: 0,
            display: 'flex',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0
          }}
        >
          <MailSidebar
            container={rootRef.current}
            currentLabelId={currentLabelId}
            labels={labels}
            onClose={sidebar.handleClose}
            onCompose={composer.handleOpen}
            open={sidebar.isOpen}
          />
          <MailContainer open={sidebar.isOpen}>
            {view === 'details' && (
              <MailThread
                currentLabelId={currentLabelId}
                emailId={emailId!}
              />
            )}
            {view === 'list' && (
              <MailList
                currentLabelId={currentLabelId}
                onSidebarToggle={sidebar.handleToggle}
              />
            )}
          </MailContainer>
        </Box>
      </Box>
      <MailComposer
        maximize={composer.isFullScreen}
        message={composer.message}
        onClose={composer.handleClose}
        onMaximize={composer.handleMaximize}
        onMessageChange={composer.handleMessageChange}
        onMinimize={composer.handleMinimize}
        onSubjectChange={composer.handleSubjectChange}
        onToChange={composer.handleToChange}
        open={composer.isOpen}
        subject={composer.subject}
        to={composer.to}
      />
    </>
  );
};

Page.getLayout = (page) => (
  <DashboardLayout>
    {page}
  </DashboardLayout>
);

export default Page;
