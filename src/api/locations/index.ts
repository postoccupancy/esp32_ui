import type { Location, LocationEmail, LocationInvoice, LocationLog } from '../../types/location';
import { applyPagination } from '../../utils/apply-pagination';
import { applySort } from '../../utils/apply-sort';
import { deepCopy } from '../../utils/deep-copy';
import { location, locations, emails, invoices, logs } from './data';

type GetLocationsRequest = {
  filters?: {
    query?: string;
    hasAcceptedMarketing?: boolean;
    isProspect?: boolean;
    isReturning?: boolean;
  };
  page?: number;
  rowsPerPage?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

type GetLocationsResponse = Promise<{
  data: Location[];
  count: number;
}>;

type GetLocationRequest = {};

type GetLocationResponse = Promise<Location>;

type GetLocationEmailsRequest = {};

type GetLocationEmailsResponse = Promise<LocationEmail[]>;

type GetLocationInvoicesRequest = {};

type GetLocationInvoicesResponse = Promise<LocationInvoice[]>;

type GetLocationLogsRequest = {};

type GetLocationLogsResponse = Promise<LocationLog[]>;

class LocationsApi {
  getLocations(request: GetLocationsRequest = {}): GetLocationsResponse {
    const { filters, page, rowsPerPage, sortBy, sortDir } = request;

    let data = deepCopy(locations) as Location[];
    let count = data.length;

    if (typeof filters !== 'undefined') {
      data = data.filter((location) => {
        if (typeof filters.query !== 'undefined' && filters.query !== '') {
          let queryMatched = false;
          const properties: ('email' | 'name')[] = ['email', 'name'];

          properties.forEach((property) => {
            if ((location[property]).toLowerCase().includes(filters.query!.toLowerCase())) {
              queryMatched = true;
            }
          });

          if (!queryMatched) {
            return false;
          }
        }

        if (typeof filters.hasAcceptedMarketing !== 'undefined') {
          if (location.hasAcceptedMarketing !== filters.hasAcceptedMarketing) {
            return false;
          }
        }

        if (typeof filters.isProspect !== 'undefined') {
          if (location.isProspect !== filters.isProspect) {
            return false;
          }
        }

        if (typeof filters.isReturning !== 'undefined') {
          if (location.isReturning !== filters.isReturning) {
            return false;
          }
        }

        return true;
      });
      count = data.length;
    }

    if (typeof sortBy !== 'undefined' && typeof sortDir !== 'undefined') {
      data = applySort(data, sortBy, sortDir);
    }

    if (typeof page !== 'undefined' && typeof rowsPerPage !== 'undefined') {
      data = applyPagination(data, page, rowsPerPage);
    }

    return Promise.resolve({
      data,
      count
    });
  }

  getLocation(request?: GetLocationRequest): GetLocationResponse {
    return Promise.resolve(deepCopy(location));
  }

  getEmails(request?: GetLocationEmailsRequest): GetLocationEmailsResponse {
    return Promise.resolve(deepCopy(emails));
  }

  getInvoices(request?: GetLocationInvoicesRequest): GetLocationInvoicesResponse {
    return Promise.resolve(deepCopy(invoices));
  }

  getLogs(request?: GetLocationLogsRequest): GetLocationLogsResponse {
    return Promise.resolve(deepCopy(logs));
  }
}

export const locationsApi = new LocationsApi();
