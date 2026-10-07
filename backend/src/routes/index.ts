import { Router } from "express";
import authRoutes from "./auth";
import companyRoutes from "./company";
import customerRoutes from "./customers";
import palletRoutes from "./pallets";
import requestRoutes from "./requests";
import locationRoutes from "./locations";
import lpnRoutes from "./lpns";
import shipmentRoutes from "./shipments";
import opsRoutes from "./ops";
import bookingRoutes from "./bookings";
import publicBookingRoutes from "./publicBookings";
import docsRoutes from "./docs";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "phoenix-wms-api", ts: new Date().toISOString() });
});

/** Public (no auth) — must stay before authenticated catch-alls */
router.use("/docs", docsRoutes);
router.use("/public/bookings", publicBookingRoutes);

router.use("/auth", authRoutes);
router.use("/company", companyRoutes);
router.use("/customers", customerRoutes);
router.use("/pallets", palletRoutes);
router.use("/requests", requestRoutes);
router.use("/locations", locationRoutes);
router.use("/lpns", lpnRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/bookings", bookingRoutes);
router.use("/", opsRoutes);

export default router;
