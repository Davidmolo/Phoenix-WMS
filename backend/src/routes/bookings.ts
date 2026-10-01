import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Booking } from "../models/Booking";
import { Customer } from "../models/Customer";
import { Warehouse } from "../models/Warehouse";
import { Request as WhRequest } from "../models/Request";
import { getServiceType } from "../constants/booking";
import {
  assertSlotOpen,
  bookingConfigPayload,
  buildDaySlots,
  durationForService,
  loadDayBookings,
  monthCalendar,
  parseDateKey,
  phoenixLocalDate,
  todayPhoenixKey,
  toDateKey,
} from "../services/bookingAvailability";

const router = Router();

router.use(requireAuth);

router.get("/config", (_req, res) => {
  res.json(bookingConfigPayload());
});

/** Month dots: ?year=2026&month=9&serviceType=crossdock */
router.get("/calendar", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const serviceType = String(req.query.serviceType || "crossdock");
    if (serviceType !== "all" && !getServiceType(serviceType)) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    const warehouseId = (req.query.warehouseId as string) || undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    if (source && source !== "all" && !["web", "phone", "admin", "portal"].includes(source)) {
      res.status(400).json({ error: "Unknown source" });
      return;
    }
    const days = await monthCalendar(companyId, year, month, serviceType, warehouseId, source);
    res.json({
      year,
      month,
      serviceType,
      source: source || "all",
      today: todayPhoenixKey(),
      days,
      ...bookingConfigPayload(),
    });
  } catch (err) {
    next(err);
  }
});

/** Day slots: ?date=YYYY-MM-DD&serviceType=crossdock */
router.get("/slots", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const date = String(req.query.date || todayPhoenixKey());
    const serviceType = String(req.query.serviceType || "crossdock");
    if (serviceType !== "all" && !getServiceType(serviceType)) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    parseDateKey(date);
    const warehouseId = (req.query.warehouseId as string) || undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    if (source && source !== "all" && !["web", "phone", "admin", "portal"].includes(source)) {
      res.status(400).json({ error: "Unknown source" });
      return;
    }
    const bookings = await loadDayBookings(companyId, date, warehouseId);
    const privacy =
      req.auth!.role === "customer"
        ? { enabled: true, viewerCustomerId: req.auth!.customerId }
        : undefined;
    const slots = buildDaySlots(date, serviceType, bookings, new Date(), source, privacy);
    const nextAvailable = slots.find((s) => s.status === "available") || null;
    res.json({
      date,
      serviceType,
      source: source || "all",
      slots,
      nextAvailable,
      ...bookingConfigPayload(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const filter: Record<string, unknown> = { companyId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.date) {
      const { y, m, d } = parseDateKey(String(req.query.date));
      filter.startsAt = {
        $gte: phoenixLocalDate(y, m, d, 0, 0),
        $lt: phoenixLocalDate(y, m, d + 1, 0, 0),
      };
    }
    if (req.auth!.role === "customer" && req.auth!.customerId) {
      filter.customerId = req.auth!.customerId;
    }

    const bookings = await Booking.find(filter).sort({ startsAt: 1 }).limit(300);
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * Create booking (admin/staff phone or desk, or portal customer).
 * Body: { serviceType, startsAt, source?, contact fields, createRequest? }
 */
router.post("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const serviceType = String(req.body.serviceType || "");
    const svc = getServiceType(serviceType);
    if (!svc) {
      res.status(400).json({ error: "serviceType required" });
      return;
    }

    const startsAt = new Date(req.body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      res.status(400).json({ error: "startsAt required (ISO)" });
      return;
    }

    const dateKey = toDateKey(startsAt);
    const warehouse =
      (req.body.warehouseId
        ? await Warehouse.findOne({ _id: req.body.warehouseId, companyId })
        : null) ||
      (await Warehouse.findOne({ companyId, active: true }).sort({ name: 1 }));

    const dayBookings = await loadDayBookings(
      companyId,
      dateKey,
      warehouse?._id?.toString()
    );
    const slots = buildDaySlots(dateKey, serviceType, dayBookings);
    const check = assertSlotOpen(slots, startsAt.toISOString());
    if (!check.ok) {
      res.status(409).json({ error: check.error });
      return;
    }

    const durationMinutes = durationForService(serviceType);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    let source = String(req.body.source || "admin");
    if (req.auth!.role === "customer") source = "portal";
    else if (source !== "phone" && source !== "admin" && source !== "web") source = "admin";

    const customerId =
      req.auth!.role === "customer" ? req.auth!.customerId : req.body.customerId || null;

    // Portal users already have an account — pull company/contact from Customer
    let companyName = String(req.body.companyName || "").trim();
    let contactName = String(req.body.contactName || "").trim();
    let phone = String(req.body.phone || "").trim();
    let email = String(req.body.email || "").trim();
    if (customerId) {
      const customer = await Customer.findOne({ _id: customerId, companyId });
      if (customer) {
        companyName = companyName || customer.name || "";
        contactName = contactName || customer.contact || "";
        phone = phone || customer.phone || "";
        email = email || customer.email || "";
      }
    }

    if (req.auth!.role === "customer") {
      const missing: string[] = [];
      if (!companyName) missing.push("company name");
      if (!contactName) missing.push("contact name");
      if (!email) missing.push("email");
      if (!phone) missing.push("phone");
      if (missing.length) {
        res.status(400).json({
          error: `Please update your profile first (${missing.join(", ")})`,
          code: "PROFILE_INCOMPLETE",
          missing,
        });
        return;
      }
    }

    // Portal/WMS request link only when we have a customer account
    let requestDoc = null;
    if (customerId && req.body.createRequest !== false) {
      requestDoc = await WhRequest.create({
        companyId,
        customerId,
        warehouseId: warehouse?._id || null,
        type: "Inbound",
        status: "pending",
        qty: Number(req.body.freight?.palletCount) || 1,
        palletCount: Number(req.body.freight?.palletCount) || 1,
        notes: [
          `Booking ${svc.label} · ${check.slot.label}`,
          companyName ? `Company: ${companyName}` : null,
          req.body.notes || null,
        ]
          .filter(Boolean)
          .join(" · "),
        dateRequested: new Date(),
        scheduledDate: startsAt,
      });
    }

    const booking = await Booking.create({
      companyId,
      warehouseId: warehouse?._id || null,
      customerId: customerId || null,
      requestId: requestDoc?._id || null,
      serviceType,
      startsAt,
      endsAt,
      durationMinutes,
      status: "confirmed",
      source,
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

    res.status(201).json({ booking, request: requestDoc, slot: check.slot });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (req.body.status !== undefined) booking.status = req.body.status;
    if (req.body.notes !== undefined) booking.notes = req.body.notes;
    if (req.body.contactName !== undefined) booking.contactName = req.body.contactName;
    if (req.body.phone !== undefined) booking.phone = req.body.phone;
    if (req.body.email !== undefined) booking.email = req.body.email;
    if (req.body.companyName !== undefined) booking.companyName = req.body.companyName;
    await booking.save();

    if (booking.requestId && req.body.status === "cancelled") {
      await WhRequest.updateOne(
        { _id: booking.requestId, companyId: req.auth!.companyId },
        { $set: { status: "cancelled" } }
      );
    }

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

export default router;
