import { Router } from "express";
import { Company } from "../models/Company";
import { Warehouse } from "../models/Warehouse";
import { Booking } from "../models/Booking";
import { getServiceType } from "../constants/booking";
import {
  assertSlotOpen,
  bookingConfigPayload,
  buildDaySlots,
  durationForService,
  loadDayBookings,
  monthCalendar,
  parseDateKey,
  todayPhoenixKey,
  toDateKey,
} from "../services/bookingAvailability";

const router = Router();

/** Resolve the single Phoenix company (or ?company= slug later). */
async function resolveCompany() {
  return Company.findOne({ active: true }).sort({ createdAt: 1 });
}

/**
 * GET /api/public/bookings — integrator index (no auth).
 * Bare URL used to 401 because it fell through to authenticated ops routes.
 */
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "phoenix-wms-public-bookings",
    docs: "/api/docs",
    note: "No authentication. For phoenixcrossdocks.com (and related marketing sites).",
    endpoints: {
      config: { method: "GET", path: "/api/public/bookings/config" },
      calendar: {
        method: "GET",
        path: "/api/public/bookings/calendar?year=2026&month=10&serviceType=crossdock",
      },
      slots: {
        method: "GET",
        path: "/api/public/bookings/slots?date=2026-10-08&serviceType=trailer_rework",
        description: "Use slot.status === 'available' for free times; others are reserved/unavailable.",
      },
      create: {
        method: "POST",
        path: "/api/public/bookings",
        body: {
          serviceType: "crossdock | trailer_rework | drop_and_store",
          startsAt: "ISO from slots[].startIso",
          companyName: "string",
          contactName: "string",
          phone: "string",
          email: "string",
          notes: "optional",
        },
      },
    },
    serviceTypes: {
      crossdock: { durationMinutes: 45, dockUnits: 2 },
      drop_and_store: { durationMinutes: 45, dockUnits: 1 },
      trailer_rework: { durationMinutes: 60, dockUnits: 1 },
    },
  });
});

router.get("/config", async (_req, res, next) => {
  try {
    const company = await resolveCompany();
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({
      company: {
        name: company.name,
        address: company.address,
        city: company.city,
      },
      ...bookingConfigPayload(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/calendar", async (req, res, next) => {
  try {
    const company = await resolveCompany();
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const serviceType = String(req.query.serviceType || "crossdock");
    if (!getServiceType(serviceType)) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    const days = await monthCalendar(company._id.toString(), year, month, serviceType);
    res.json({
      year,
      month,
      serviceType,
      today: todayPhoenixKey(),
      days,
      ...bookingConfigPayload(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/slots", async (req, res, next) => {
  try {
    const company = await resolveCompany();
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const date = String(req.query.date || todayPhoenixKey());
    const serviceType = String(req.query.serviceType || "crossdock");
    if (!getServiceType(serviceType)) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    parseDateKey(date);
    const bookings = await loadDayBookings(company._id.toString(), date);
    const slots = buildDaySlots(date, serviceType, bookings, new Date(), null, {
      enabled: true,
      viewerCustomerId: null,
    });
    const nextAvailable = slots.find((s) => s.status === "available") || null;
    res.json({ date, serviceType, slots, nextAvailable, ...bookingConfigPayload() });
  } catch (err) {
    next(err);
  }
});

/**
 * Website form booking — no auth.
 * Matches marketing form: company, contact, phone, email, service type, slot.
 */
router.post("/", async (req, res, next) => {
  try {
    const company = await resolveCompany();
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const serviceType = String(req.body.serviceType || "");
    const svc = getServiceType(serviceType);
    if (!svc) {
      res.status(400).json({ error: "Type of service is required" });
      return;
    }

    const companyName = String(req.body.companyName || "").trim();
    const contactName = String(req.body.contactName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    if (!companyName || !contactName || !phone || !email) {
      res.status(400).json({ error: "Company, contact name, phone, and email are required" });
      return;
    }

    const startsAt = new Date(req.body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      res.status(400).json({ error: "Please pick an available time slot" });
      return;
    }

    const dateKey = toDateKey(startsAt);
    const warehouse = await Warehouse.findOne({ companyId: company._id, active: true }).sort({
      name: 1,
    });
    const dayBookings = await loadDayBookings(company._id.toString(), dateKey, warehouse?._id?.toString());
    const slots = buildDaySlots(dateKey, serviceType, dayBookings, new Date(), null, {
      enabled: true,
      viewerCustomerId: null,
    });
    const check = assertSlotOpen(slots, startsAt.toISOString());
    if (!check.ok) {
      res.status(409).json({ error: check.error });
      return;
    }

    const durationMinutes = durationForService(serviceType);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    const booking = await Booking.create({
      companyId: company._id,
      warehouseId: warehouse?._id || null,
      customerId: null,
      requestId: null,
      serviceType,
      startsAt,
      endsAt,
      durationMinutes,
      status: "confirmed",
      source: "web",
      companyName,
      contactName,
      phone,
      email,
      notes: req.body.notes || "",
      freight: {
        trailerNumber: req.body.freight?.trailerNumber || "",
        palletCount: req.body.freight?.palletCount ?? null,
        weightLbs: req.body.freight?.weightLbs ?? null,
        details: req.body.freight?.details || "",
      },
    });

    res.status(201).json({
      booking: {
        _id: booking._id,
        serviceType: booking.serviceType,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status,
        companyName: booking.companyName,
      },
      slot: check.slot,
      message: "You’re booked — check your email for bay and gate instructions.",
    });
  } catch (err) {
    next(err);
  }
});

/** Stop fall-through into authenticated /api routes (avoids false 401s). */
router.use((_req, res) => {
  res.status(404).json({
    error: "Not found",
    docs: "/api/docs",
    hint: "Try GET /api/public/bookings or /api/public/bookings/slots",
  });
});

export default router;
