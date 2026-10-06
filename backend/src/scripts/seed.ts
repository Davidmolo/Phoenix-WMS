/**
 * Seed from client source docs (not invented demo fluff):
 * - SBA_Warehouse_Handling_Agreement_PDCsigned.pdf
 * - CT_Warehouse_Lease_Proforma_14.xlsx (24 pallets on site, Suite 5 / 5,700 SF, rates)
 * - Marketing project plan1.xlsx (team + published rate sheet)
 * - Phoenix fee schedule figures from proforma §8 / marketing task #24
 */
import bcrypt from "bcryptjs";
import { connectDb } from "../config/db";
import { Company } from "../models/Company";
import { Warehouse } from "../models/Warehouse";
import { Customer } from "../models/Customer";
import { User } from "../models/User";
import { Location } from "../models/Location";
import { Pallet } from "../models/Pallet";
import { Lpn } from "../models/Lpn";
import { Shipment } from "../models/Shipment";
import { Request as WhRequest } from "../models/Request";
import { Accessorial } from "../models/Accessorial";
import { Invoice } from "../models/Invoice";
import { Booking } from "../models/Booking";

import { DEFAULT_FEE_SCHEDULE } from "../constants/feeSchedule";
import { BOOKING_DEFAULTS } from "../constants/booking";
import { phoenixLocalDate, todayPhoenixKey, parseDateKey, toDateKey } from "../services/bookingAvailability";

/** From proforma §8 + marketing “Publish / lock rate sheet”. */
const PHX_FEE_SCHEDULE = { ...DEFAULT_FEE_SCHEDULE };

/** Proforma §3 — bridge inventory currently on floor. */
const BRIDGE_PALLET_COUNT = 24;

/** Job/ref labels shaped like SBA tower/site freight (no confidential SKUs in the docs). */
const SBA_JOB_NAMES = [
  "Site kit — Phoenix metro",
  "Antenna hardware",
  "Shelter spares",
  "Cable & connectors",
  "Grounding materials",
  "Mount hardware",
  "Power plant accessories",
  "RF jumpers",
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function seed() {
  await connectDb();

  await Promise.all([
    Booking.deleteMany({}),
    Invoice.deleteMany({}),
    Accessorial.deleteMany({}),
    WhRequest.deleteMany({}),
    Lpn.deleteMany({}),
    Pallet.deleteMany({}),
    Shipment.deleteMany({}),
    User.deleteMany({}),
    Customer.deleteMany({}),
    Location.deleteMany({}),
    Warehouse.deleteMany({}),
    Company.deleteMany({}),
  ]);

  // Provider from signed SBA agreement
  const company = await Company.create({
    name: "Phoenix Cross Dock",
    legalName: "Phoenix Arizona Cross Dock LLC",
    city: "Phoenix, AZ",
    address: "3550 West Clarendon Avenue, Suite 5, Phoenix, AZ 85019",
    feeSchedule: PHX_FEE_SCHEDULE,
  });

  // Proforma: Suite 5, 5,700 SF @ Thomas Industrial Plaza
  const mapRows = 5;
  const mapCols = 8;
  const warehouse = await Warehouse.create({
    companyId: company._id,
    name: "Clarendon — Suite 5",
    city: "Phoenix, AZ",
    address: "3550 West Clarendon Avenue, Suite 5, Phoenix, AZ 85019",
    sqft: 5700,
    storageMode: "mixed",
    mapLayout: { rows: mapRows, cols: mapCols },
  });

  // Floor grid (racking not installed yet — proforma §1 racking = 0)
  const locationDocs = [];
  let n = 0;
  for (let row = 0; row < mapRows; row++) {
    for (let col = 0; col < mapCols; col++) {
      n += 1;
      locationDocs.push({
        companyId: company._id,
        warehouseId: warehouse._id,
        code: `W-${n}`,
        aisle: "W",
        type: "inside" as const,
        level: 1,
        spot: 1,
        floorOnly: true,
        row,
        col,
        palletId: null as null,
      });
    }
  }
  const locations = await Location.insertMany(locationDocs);

  // Signed SBA agreement parties + commercial terms
  const sba = await Customer.create({
    companyId: company._id,
    name: "SBA Communications Corporation",
    contact: "SBA Logistics / Ops",
    email: "sba.ops@sbasite.com",
    phone: "",
    address: "Onyx Business Center, 1717 Firman Drive, Suite 700, Richardson, TX 75081",
    billingMethod: "contract",
    contractSqft: 2500,
    contractFee: 7500,
    contractHandlingPerPallet: 20,
    contractFtlRate: 520,
    contractNoDwellInside: true,
    portalActivated: true,
    since: new Date("2026-10-01"),
  });

  // Marketing plan List Data — real team names/roles
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  await User.create([
    {
      companyId: company._id,
      email: "david@phoenixcrossdock.com",
      passwordHash,
      name: "David Molo",
      role: "admin",
    },
    {
      companyId: company._id,
      email: "cesar@phoenixcrossdock.com",
      passwordHash,
      name: "Cesar Ramirez",
      role: "staff",
    },
    {
      companyId: company._id,
      email: "admin@phoenixcrossdock.com",
      passwordHash,
      name: "Phoenix Admin",
      role: "admin",
    },
    {
      companyId: company._id,
      email: "sba@sbasite.com",
      passwordHash,
      name: "SBA Portal User",
      role: "customer",
      customerId: sba._id,
    },
  ]);

  // --- Bridge inventory: 24 pallets on site (proforma §3) ---
  // Received before Oct 1 commencement; now under signed contract terms for go-live billing.
  const inbound = await Shipment.create({
    companyId: company._id,
    warehouseId: warehouse._id,
    customerId: sba._id,
    direction: "inbound",
    status: "completed",
    carrier: "SBA contracted carrier",
    trailerNumber: "SBA-PHX-01",
    bolNumber: "BOL-SBA-BRIDGE-001",
    billAsFtl: false,
    notes:
      "Bridge inventory from CT_Warehouse_Lease_Proforma §3 — 24 pallets currently on site prior to Oct 1 contract start.",
    completedAt: daysAgo(12),
    palletIds: [],
  });

  const pallets = [];
  for (let i = 0; i < BRIDGE_PALLET_COUNT; i++) {
    const loc = locations[i];
    const externalId = `PLT-SBA-${String(1001 + i).padStart(4, "0")}`;
    const receivedAt = daysAgo(18 - (i % 10));
    const pallet = await Pallet.create({
      companyId: company._id,
      warehouseId: warehouse._id,
      customerId: sba._id,
      locationId: loc._id,
      externalId,
      status: i < 20 ? "stored" : "staged",
      description: `SBA dedicated-space inventory (${i + 1}/${BRIDGE_PALLET_COUNT})`,
      jobName: SBA_JOB_NAMES[i % SBA_JOB_NAMES.length],
      poNumber: `PO-SBA-2026-${String(40 + (i % 8)).padStart(3, "0")}`,
      ref: `BRIDGE-${String(i + 1).padStart(2, "0")}`,
      weightLbs: 450 + (i % 7) * 35,
      dimLength: 48,
      dimWidth: 48,
      dimHeight: 48,
      sqft: 16,
      receivedAt,
      notes:
        "Sourced from proforma: 24 pallets currently on site (bridge). Dedicated 2,500 SF — no dwell fee inside contract space.",
    });

    await Location.findByIdAndUpdate(loc._id, { palletId: pallet._id });

    const lpn = await Lpn.create({
      companyId: company._id,
      warehouseId: warehouse._id,
      customerId: sba._id,
      palletId: pallet._id,
      palletIds: [pallet._id],
      code: `LPN-SBA-${String(1001 + i).padStart(4, "0")}`,
      kind: "unit",
      description: pallet.description,
      qty: 1,
      uom: "pallet",
      status: "active",
    });
    pallet.lpnIds = [lpn._id];
    await pallet.save();

    // Contract handling $20 flat (IN+OUT) — agreement §5; charged once for bridge stock at go-live
    await Accessorial.create({
      companyId: company._id,
      customerId: sba._id,
      palletId: pallet._id,
      shipmentId: inbound._id,
      type: "handling",
      description: `Contract handling (IN+OUT) — ${externalId}`,
      amount: 20,
      date: receivedAt,
    });

    pallets.push(pallet);
    inbound.palletIds.push(pallet._id);
  }
  await inbound.save();

  // Sample portal requests (agreement §10 — inbound/outbound + inventory visibility)
  await WhRequest.insertMany([
    {
      companyId: company._id,
      customerId: sba._id,
      warehouseId: warehouse._id,
      type: "Outbound",
      status: "pending",
      qty: 4,
      palletCount: 4,
      ref: "Need 4 staged pallets released early next week",
      jobName: "Site kit — Phoenix metro",
      poNumber: "PO-SBA-2026-048",
      notes: "Coordinate dock appointment during normal business hours (agreement §9).",
      dateRequested: daysAgo(1),
    },
    {
      companyId: company._id,
      customerId: sba._id,
      warehouseId: warehouse._id,
      type: "Inbound",
      status: "approved",
      qty: 6,
      palletCount: 6,
      ref: "ETA this week — antenna hardware",
      jobName: "Antenna hardware",
      poNumber: "PO-SBA-2026-055",
      notes: "Within dedicated 2,500 SF allocation.",
      dateRequested: daysAgo(3),
      scheduledDate: daysAgo(-2),
    },
  ]);

  // One completed outbound of 2 bridge pallets (so shipments list isn’t empty)
  const toShip = pallets.slice(20, 22);
  const outbound = await Shipment.create({
    companyId: company._id,
    warehouseId: warehouse._id,
    customerId: sba._id,
    direction: "outbound",
    status: "completed",
    carrier: "Regional LTL",
    trailerNumber: "OUT-8821",
    bolNumber: "BOL-SBA-OUT-014",
    palletIds: toShip.map((p) => p._id),
    completedAt: daysAgo(2),
    notes: "Partial release from bridge inventory.",
  });
  for (const p of toShip) {
    if (p.locationId) await Location.findByIdAndUpdate(p.locationId, { palletId: null });
    p.status = "shipped";
    p.shippedAt = daysAgo(2);
    p.locationId = null;
    await p.save();
    await Lpn.updateMany({ palletId: p._id }, { $set: { status: "shipped" } });
  }

  // Demo invoice register row (matches docs/reference/index_33.html Billing → Draft invoice pattern).
  // Official production invoices will sync from QuickBooks; seed keeps a realistic draft for UI/demo.
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const dueDate = new Date(periodEnd);
  dueDate.setDate(dueDate.getDate() + 30);

  const periodCharges = await Accessorial.find({
    companyId: company._id,
    customerId: sba._id,
    invoiceId: null,
    date: { $gte: periodStart, $lte: periodEnd },
  });

  const invoiceLines: Array<{
    description: string;
    qty: number;
    unitAmount: number;
    amount: number;
    type: string;
    palletId?: unknown;
    shipmentId?: unknown;
  }> = [
    {
      description: `Base rent — ${sba.name} · ${sba.contractSqft} SF @ contract rate`,
      qty: 1,
      unitAmount: sba.contractFee,
      amount: sba.contractFee,
      type: "base_rent",
    },
  ];
  for (const c of periodCharges) {
    invoiceLines.push({
      description: c.description,
      qty: 1,
      unitAmount: c.amount,
      amount: c.amount,
      type: c.type || "handling",
      palletId: c.palletId || undefined,
      shipmentId: c.shipmentId || undefined,
    });
  }
  const subtotal = invoiceLines.reduce((s, l) => s + l.amount, 0);
  const seedInvoice = await Invoice.create({
    companyId: company._id,
    customerId: sba._id,
    number: "INV-00001",
    periodStart,
    periodEnd,
    lines: invoiceLines,
    subtotal,
    total: subtotal,
    dueDate,
    status: "draft",
    notes: "Seed draft from client HTML prototype billing pattern · Net 30 · QuickBooks sync later",
  });
  if (periodCharges.length) {
    await Accessorial.updateMany(
      { _id: { $in: periodCharges.map((c) => c._id) } },
      { $set: { invoiceId: seedInvoice._id } }
    );
  }

  // Prototype dock bookings (Calendly-style) — web + phone sources
  const duration = BOOKING_DEFAULTS.defaultDurationMinutes;
  const todayKey = todayPhoenixKey();
  const { y, m, d } = parseDateKey(todayKey);
  const tomorrowKey = toDateKey(phoenixLocalDate(y, m, d + 1, 12, 0));
  const { y: ty, m: tm, d: td } = parseDateKey(tomorrowKey);

  const seedBookingSpecs = [
    {
      serviceType: "crossdock" as const,
      startsAt: phoenixLocalDate(y, m, d, 9, 0),
      source: "phone" as const,
      companyName: "Summit Freight Lines",
      contactName: "Jordan Reyes",
      phone: "(555) 555-0100",
      email: "jordan@summitfreight.example",
    },
    {
      serviceType: "crossdock" as const,
      startsAt: phoenixLocalDate(y, m, d, 11, 30),
      source: "web" as const,
      companyName: "Desert Parcel Co",
      contactName: "Alex Chen",
      phone: "(602) 555-0142",
      email: "alex@desertparcel.example",
    },
    {
      serviceType: "trailer_rework" as const,
      startsAt: phoenixLocalDate(y, m, d, 14, 0),
      source: "phone" as const,
      companyName: "SBA Network Services",
      contactName: "Site ops desk",
      phone: "(480) 555-0199",
      email: "sba@sbasite.com",
      customerId: sba._id,
    },
    {
      serviceType: "drop_and_store" as const,
      startsAt: phoenixLocalDate(ty, tm, td, 10, 0),
      source: "web" as const,
      companyName: "Valley Retail Inbound",
      contactName: "Morgan Lee",
      phone: "(623) 555-0177",
      email: "morgan@valleyretail.example",
    },
  ];

  for (const spec of seedBookingSpecs) {
    const endsAt = new Date(spec.startsAt.getTime() + duration * 60_000);
    await Booking.create({
      companyId: company._id,
      warehouseId: warehouse._id,
      customerId: spec.customerId || null,
      serviceType: spec.serviceType,
      startsAt: spec.startsAt,
      endsAt,
      durationMinutes: duration,
      status: "confirmed",
      source: spec.source,
      companyName: spec.companyName,
      contactName: spec.contactName,
      phone: spec.phone,
      email: spec.email,
      notes: "Seed booking for calendar prototype",
    });
  }

  const activeOnFloor = BRIDGE_PALLET_COUNT - toShip.length;
  const unbilled = await Accessorial.countDocuments({ invoiceId: null });

  console.log("Seed complete — data sourced from client docs.");
  console.log({
    sources: [
      "SBA_Warehouse_Handling_Agreement_PDCsigned.pdf",
      "CT_Warehouse_Lease_Proforma_14.xlsx (§3 bridge = 24 pallets; Suite 5 / 5700 SF; SBA 2500@$3=$7500)",
      "docs/reference/index_33.html (Billing draft invoice / generate pattern)",
    ],
    company: company.legalName,
    warehouse: { name: warehouse.name, sqft: warehouse.sqft },
    sba: {
      contractSqft: sba.contractSqft,
      contractFee: sba.contractFee,
      handling: sba.contractHandlingPerPallet,
      ftl: sba.contractFtlRate,
    },
    feeSchedule: {
      crossDockPerPallet: PHX_FEE_SCHEDULE.crossDockPerPallet,
      floorStoragePerPalletMo: PHX_FEE_SCHEDULE.floorStoragePerPalletMo,
      dwellAfter48h: PHX_FEE_SCHEDULE.afterFreeDwellPerPalletDay,
      trailer: PHX_FEE_SCHEDULE.crossDockPerTrailer,
    },
    inventory: {
      bridgePalletsSeeded: BRIDGE_PALLET_COUNT,
      activeOnFloor,
      shippedSample: toShip.length,
      unbilledHandlingLines: unbilled,
      inboundShipment: inbound.bolNumber,
      outboundShipment: outbound.bolNumber,
      seedInvoice: {
        number: seedInvoice.number,
        total: seedInvoice.total,
        status: seedInvoice.status,
        lines: invoiceLines.length,
      },
    },
    logins: [
      "david@phoenixcrossdock.com / ChangeMe123!  (Owner — David Molo)",
      "cesar@phoenixcrossdock.com / ChangeMe123!  (GM — Cesar Ramirez)",
      "admin@phoenixcrossdock.com / ChangeMe123!",
      "sba@sbasite.com / ChangeMe123!  (SBA portal)",
    ],
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
