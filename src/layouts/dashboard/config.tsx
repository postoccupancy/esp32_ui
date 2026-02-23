import type { ReactNode } from 'react';
import type { TFunction } from 'react-i18next';
import { SvgIcon } from '@mui/material';
import BarChartSquare02Icon from '../../icons/untitled-ui/duocolor/bar-chart-square-02';
import CalendarIcon from '../../icons/untitled-ui/duocolor/calendar';
import CheckDone01Icon from '../../icons/untitled-ui/duocolor/check-done-01';
import GraduationHat01Icon from '../../icons/untitled-ui/duocolor/graduation-hat-01';
import HomeSmileIcon from '../../icons/untitled-ui/duocolor/home-smile';
import LayoutAlt02Icon from '../../icons/untitled-ui/duocolor/layout-alt-02';
import Mail03Icon from '../../icons/untitled-ui/duocolor/mail-03';
import MessageChatSquareIcon from '../../icons/untitled-ui/duocolor/message-chat-square';
import ReceiptCheckIcon from '../../icons/untitled-ui/duocolor/receipt-check';
import Truck01Icon from '../../icons/untitled-ui/duocolor/truck-01';
import Upload04Icon from '../../icons/untitled-ui/duocolor/upload-04';
import Users03Icon from '../../icons/untitled-ui/duocolor/users-03';
import { tokens } from '../../locales/tokens';
import { paths } from '../../paths';

interface Item {
  disabled?: boolean;
  icon?: ReactNode;
  items?: Item[];
  label?: ReactNode;
  path?: string;
  title: string;
}

export interface Section {
  items: Item[];
  subheader?: string;
}

export const getSections = (t: TFunction): Section[] => [
  {
    items: [
      {
        title: t(tokens.nav.overview),
        path: paths.dashboard.index,
        icon: (
          <SvgIcon fontSize="small">
            <HomeSmileIcon />
          </SvgIcon>
        )
      },
      {
        title: t(tokens.nav.analytics),
        path: paths.dashboard.analytics,
        icon: (
          <SvgIcon fontSize="small">
            <BarChartSquare02Icon />
          </SvgIcon>
        )
      },
      {
        title: t(tokens.nav.locations),
        path: paths.dashboard.locations.index,
        icon: (
          <SvgIcon fontSize="small">
            <Users03Icon />
          </SvgIcon>
        ),
        items: [
          {
            title: t(tokens.nav.list),
            path: paths.dashboard.locations.index
          },
          {
            title: t(tokens.nav.map),
            path: paths.dashboard.logistics.fleet
          }
        ]
      },
      {
        title: t(tokens.nav.alerts),
        path: paths.dashboard.alerts,
        icon: (
          <SvgIcon fontSize="small">
            <ReceiptCheckIcon />
          </SvgIcon>
        )
      },
      {
        title: t(tokens.nav.futureFeatures),
        path: paths.dashboard.academy.index,
        icon: (
          <SvgIcon fontSize="small">
            <Truck01Icon />
          </SvgIcon>
        ),
        items: [
          {
            title: t(tokens.nav.academy),
            path: paths.dashboard.academy.index,
            icon: (
              <SvgIcon fontSize="small">
                <GraduationHat01Icon />
              </SvgIcon>
            ),
            items: [
              {
                title: t(tokens.nav.dashboard),
                path: paths.dashboard.academy.index
              },
              {
                title: t(tokens.nav.course),
                path: paths.dashboard.academy.courseDetails
              }
            ]
          },
          {
            title: t(tokens.nav.blog),
            path: paths.dashboard.blog.index,
            icon: (
              <SvgIcon fontSize="small">
                <LayoutAlt02Icon />
              </SvgIcon>
            ),
            items: [
              {
                title: t(tokens.nav.postList),
                path: paths.dashboard.blog.index
              },
              {
                title: t(tokens.nav.postDetails),
                path: paths.dashboard.blog.postDetails
              },
              {
                title: t(tokens.nav.postCreate),
                path: paths.dashboard.blog.postCreate
              }
            ]
          },
          {
            title: t(tokens.nav.fileManager),
            path: paths.dashboard.fileManager,
            icon: (
              <SvgIcon fontSize="small">
                <Upload04Icon />
              </SvgIcon>
            )
          },
          {
            title: t(tokens.nav.kanban),
            path: paths.dashboard.kanban,
            icon: (
              <SvgIcon fontSize="small">
                <CheckDone01Icon />
              </SvgIcon>
            )
          },
          {
            title: t(tokens.nav.mail),
            path: paths.dashboard.mail,
            icon: (
              <SvgIcon fontSize="small">
                <Mail03Icon />
              </SvgIcon>
            )
          },
          {
            title: t(tokens.nav.chat),
            path: paths.dashboard.chat,
            icon: (
              <SvgIcon fontSize="small">
                <MessageChatSquareIcon />
              </SvgIcon>
            )
          },
          {
            title: t(tokens.nav.calendar),
            path: paths.dashboard.calendar,
            icon: (
              <SvgIcon fontSize="small">
                <CalendarIcon />
              </SvgIcon>
            )
          }
        ]
      }
    ]
  }
];
