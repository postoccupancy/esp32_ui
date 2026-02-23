export interface Location {
  id: string;
  address1?: string;
  address2?: string;
  avatar?: string;
  balance?: number;
  city?: string;
  country?: string;
  currency?: string;
  email: string;
  hasAcceptedMarketing?: boolean;
  hasDiscount?: boolean;
  isProspect?: boolean;
  isReturning?: boolean;
  isVerified?: boolean;
  latitude?: number;
  longitude?: number;
  name: string;
  phone?: string;
  state?: string;
  totalSpent?: number;
  totalOrders?: number;
  updatedAt?: number;
  vatRate?: number;
  zipCode?: string;
}

export interface LocationLog {
  id: string;
  createdAt: number;
  description: string;
  ip: string;
  method: string;
  route: string;
  status: number;
}

export interface LocationEmail {
  id: string;
  description: string;
  createdAt: number;
}

export interface LocationInvoice {
  id: string;
  issueDate: number;
  status: string;
  amount: number;
}
