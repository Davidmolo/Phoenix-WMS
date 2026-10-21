import { Router } from "express";
import authRoutes from "./auth";
import companyRoutes from "./company";
import customerRoutes from "./customers";
import palletRoutes from "./pallets";
import cycleCountRoutes from "./cycleCounts";
import requestRoutes from "./requests";
import locationRoutes from "./locations";
import lpnRoutes from "./lpns";
import shipmentRoutes from "./shipments";
import opsRoutes from "./ops";
import bookingRoutes from "./bookings";
import publicBookingRoutes from "./publicBookings";
import docsRoutes from "./docs";
import quickbooksRoutes from "./quickbooks";
import yardJobRoutes from "./yardJobs";
import geoRoutes from "./geo";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "phoenix-wms-api", ts: new Date().toISOString() });
});

/** Public (no auth) — must stay before authenticated catch-alls */
router.use("/docs", docsRoutes);
router.use("/public/bookings", publicBookingRoutes);
/** OAuth callback is public; other QB routes require staff auth inside the router */
router.use("/quickbooks", quickbooksRoutes);

router.use("/auth", authRoutes);
router.use("/company", companyRoutes);
router.use("/customers", customerRoutes);
router.use("/pallets", palletRoutes);
router.use("/cycle-counts", cycleCountRoutes);
router.use("/requests", requestRoutes);
router.use("/locations", locationRoutes);
router.use("/lpns", lpnRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/yard-jobs", yardJobRoutes);
router.use("/bookings", bookingRoutes);
router.use("/geo", geoRoutes);
router.use("/", opsRoutes);

export default router;
