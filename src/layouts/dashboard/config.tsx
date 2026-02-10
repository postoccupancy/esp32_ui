import type { ReactNode } from 'react';
import type { TFunction } from 'react-i18next';
import { Chip, SvgIcon } from '@mui/material';
import AlignLeft02Icon from '../../icons/untitled-ui/duocolor/align-left-02';
import BarChartSquare02Icon from '../../icons/untitled-ui/duocolor/bar-chart-square-02';
import Building04Icon from '../../icons/untitled-ui/duocolor/building-04';
import CalendarIcon from '../../icons/untitled-ui/duocolor/calendar';
import CheckDone01Icon from '../../icons/untitled-ui/duocolor/check-done-01';
import CreditCard01Icon from '../../icons/untitled-ui/duocolor/credit-card-01';
import CurrencyBitcoinCircleIcon from '../../icons/untitled-ui/duocolor/currency-bitcoin-circle';
import File01Icon from '../../icons/untitled-ui/duocolor/file-01';
import GraduationHat01Icon from '../../icons/untitled-ui/duocolor/graduation-hat-01';
import HomeSmileIcon from '../../icons/untitled-ui/duocolor/home-smile';
import LayoutAlt02Icon from '../../icons/untitled-ui/duocolor/layout-alt-02';
import LineChartUp04Icon from '../../icons/untitled-ui/duocolor/line-chart-up-04';
import Lock01Icon from '../../icons/untitled-ui/duocolor/lock-01';
import LogOut01Icon from '../../icons/untitled-ui/duocolor/log-out-01';
import Mail03Icon from '../../icons/untitled-ui/duocolor/mail-03';
import Mail04Icon from '../../icons/untitled-ui/duocolor/mail-04';
import MessageChatSquareIcon from '../../icons/untitled-ui/duocolor/message-chat-square';
import ReceiptCheckIcon from '../../icons/untitled-ui/duocolor/receipt-check';
import Share07Icon from '../../icons/untitled-ui/duocolor/share-07';
import ShoppingBag03Icon from '../../icons/untitled-ui/duocolor/shopping-bag-03';
import ShoppingCart01Icon from '../../icons/untitled-ui/duocolor/shopping-cart-01';
import Truck01Icon from '../../icons/untitled-ui/duocolor/truck-01';
import Upload04Icon from '../../icons/untitled-ui/duocolor/upload-04';
import Users03Icon from '../../icons/untitled-ui/duocolor/users-03';
import XSquareIcon from '../../icons/untitled-ui/duocolor/x-square';
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
        title: t(tokens.nav.account),
        path: paths.dashboard.account,
        icon: (
          <SvgIcon fontSize="small">
            <HomeSmileIcon />
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
            title: t(tokens.nav.details),
            path: paths.dashboard.locations.details
          },
          {
            title: t(tokens.nav.edit),
            path: paths.dashboard.locations.edit
          }
        ]
      },
      {
        title: t(tokens.nav.logistics),
        path: paths.dashboard.logistics.index,
        icon: (
          <SvgIcon fontSize="small">
            <Truck01Icon />
          </SvgIcon>
        ),
        items: [
          {
            title: t(tokens.nav.dashboard),
            path: paths.dashboard.logistics.index
          },
          {
            title: t(tokens.nav.fleet),
            path: paths.dashboard.logistics.fleet
          }
        ]
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
]}];
