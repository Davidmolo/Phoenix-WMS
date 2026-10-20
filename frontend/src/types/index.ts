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
  /** Admin overrides — blank/null uses company fee schedule (Cesar). */
  rateInside?: number | null;
  rateOutside?: number | null;
  unloadFee?: number | null;
  loadFee?: number | null;
  rateInsideSqft?: number | null;
  rateOutsideSqft?: number | null;
  crossdockPerPallet?: number | null;
  serviceDropStore?: boolean;
  serviceCrossdock?: boolean;
  serviceRework?: boolean;
  reworkHourlyRate?: number | null;
  reworkMinimumHours?: number | null;
  transportEnabled?: boolean;
  transportInboundFee?: number;
  transportOutboundFee?: number;
  email?: string;
  phone?: string;
  contact?: string;
  contacts?: {
    name: string;
    email: string;
    phone: string;
    primary?: boolean;
    invitedAt?: string | null;
  }[];
  address?: string;
  active?: boolean;
  since?: string;
  /** True after they set a portal password from the invite email. */
  portalActivated?: boolean;
  /** True when an invite email was sent and they have not set a password yet. */
  invitePending?: boolean;
  /** active = onboarded · invite_sent = emailed, no password yet · not_invited = never invited */
  portalStatus?: "active" | "invite_sent" | "not_invited";
  quickbooksCustomerId?: string | null;
  /** Origin of the customer record — not cleared when QB is disconnected. */
  source?: "wms" | "quickbooks";
  /** When true, WMS invoices create but are not pushed to QuickBooks. */
  testAccount?: boolean;
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
  customerId: string | { _id: string; name?: string };
  warehouseId?: string;
  locationId?: string | PalletLocation | null;
  /** Second adjacent slot when footprint exceeds 48×48 (oversized putaway). */
  secondaryLocationId?: string | PalletLocation | null;
  /** Denormalized slot codes for barcode labels. */
  locationCode?: string;
  secondaryLocationCode?: string;
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
  receiptPhotoPaths?: string[];
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
  abnormalPallets?: boolean;
  abnormalPalletSize?: string;
  dateRequested: string;
  customerId?: string | { _id: string; name?: string; billingMethod?: string };
};

export type Invoice = {
  _id: string;
  number: string;
  status: string;
  /** Full invoice amount (what was billed). */
  total: number;
  /** Amount still owed after payments (QuickBooks Balance). */
  balanceDue?: number | null;
  subtotal?: number;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  notes?: string;
  quickbooksId?: string | null;
  customerId?: string | { _id: string; name?: string; billingMethod?: string };
  lines?: Array<{
    description: string;
    amount: number;
    type: string;
    qty?: number;
    unitAmount?: number;
  }>;
};

export type Warehouse = {
  _id: string;
  name: string;
  address?: string;
  sqft?: number | null;
  mapLayout?: { rows: number; cols: number };
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
  /** Paid + sent + past-due invoice total for the current calendar month. */
  revenueMtd?: number;
  /** Same total for the prior calendar month. */
  revenueLastMonth?: number;
};

export type Location = {
  _id: string;
  code: string;
  aisle: string;
  type: string;
  level?: number;
  spot?: number;
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

export type BolSignature = {
  role: "driver" | "warehouse";
  name: string;
  imageDataUrl?: string;
  signedAt?: string;
};

export type ShipmentBol = {
  status?: "draft" | "open" | "closed";
  driverName?: string;
  truckNumber?: string;
  countVerified?: boolean | null;
  actualCount?: number | null;
  rewrapBanding?: boolean | null;
  condition?: string;
  exceptionNotes?: string;
  billingFlags?: string[];
  declaredValue?: string;
  refInboundBol?: string;
  timeReceived?: string | null;
  timeReleased?: string | null;
  signatures?: BolSignature[];
  exceptionPhotoPaths?: string[];
  closedAt?: string | null;
  documentPath?: string;
  invoiceId?: string | null;
};

export type Shipment = {
  _id: string;
  direction: "inbound" | "outbound";
  status: string;
  customerId?: string | { _id: string; name?: string; email?: string };
  /** Appointment flavor: drop_and_store | crossdock | trailer_rework | pickup. */
  serviceType?: string;
  carrier?: string;
  trailerNumber?: string;
  bolNumber?: string;
  sealNumber?: string;
  scac?: string;
  shipFrom?: string;
  shipTo?: string;
  thirdParty?: string;
  weightLbs?: number | null;
  billAsFtl?: boolean;
  completedAt?: string | null;
  createdAt?: string;
  scheduledAt?: string | null;
  notes?: string;
  palletIds?: string[];
  requestId?: string | null;
  jobName?: string;
  poNumber?: string;
  /** Planned count on expected appointments (Booking → Expected → ops). */
  expectedPalletCount?: number | null;
  bol?: ShipmentBol;
};

export type Booking = {
  _id: string;
  serviceType: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: string;
  source: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  customerId?: string | null;
  requestId?: string | null;
};
