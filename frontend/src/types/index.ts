export type BillingMethod = "pallet" | "sqft" | "contract" | "crossdock";

export type Customer = {
  _id: string;
  name: string;
  billingMethod: BillingMethod | string;
  contractFee?: number;
  contractSqft?: number;
  contractHandlingPerPallet?: number | null;
  contractFtlRate?: number | null;
  contractNoDwellInside?: boolean;
  email?: string;
  phone?: string;
  contact?: string;
  address?: string;
  since?: string;
};

export type PalletLocation = {
  _id: string;
  code: string;
  aisle?: string;
  type?: string;
};

export type Pallet = {
  _id: string;
  externalId: string;
  status: string;
  description?: string;
  customerId: string;
  warehouseId?: string;
  locationId?: string | PalletLocation | null;
  weightLbs?: number | null;
  sqft?: number | null;
  dimLength?: number | null;
  dimWidth?: number | null;
  dimHeight?: number | null;
  receivedAt?: string | null;
  shippedAt?: string | null;
  jobName?: string;
  poNumber?: string;
  ref?: string;
  notes?: string;
};

export type WhRequest = {
  _id: string;
  type: string;
  status: string;
  qty: number;
  ref?: string;
  jobName?: string;
  poNumber?: string;
  notes?: string;
  dateRequested: string;
};

export type Invoice = {
  _id: string;
  number: string;
  status: string;
  total: number;
  periodStart: string;
  periodEnd: string;
  lines?: Array<{ description: string; amount: number; type: string }>;
};

export type DashboardKpis = {
  activePallets: number;
  pendingRequests: number;
  draftInvoices: number;
  customers: number;
  openCharges?: number;
  locationsAvailable?: number;
  capacitySqft?: number;
  occupiedSqft?: number;
  availableSqft?: number;
};

export type Warehouse = {
  _id: string;
  name: string;
  address?: string;
  sqft?: number | null;
};

export type Location = {
  _id: string;
  code: string;
  aisle: string;
  type: string;
  palletId?: string | null;
  row: number;
  col: number;
};

export type Lpn = {
  _id: string;
  code: string;
  status: string;
  description?: string;
  qty: number;
  kind?: string;
  palletId?: string | null;
  palletIds?: Array<string | { _id: string; externalId?: string; status?: string }>;
  customerId: string;
};

export type Shipment = {
  _id: string;
  direction: "inbound" | "outbound";
  status: string;
  carrier?: string;
  trailerNumber?: string;
  billAsFtl?: boolean;
  completedAt?: string | null;
  createdAt?: string;
  scheduledAt?: string | null;
  notes?: string;
  palletIds?: string[];
  requestId?: string | null;
  jobName?: string;
  poNumber?: string;
};
