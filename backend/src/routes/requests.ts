import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Request as WhRequest } from "../models/Request";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.status) filter.status = req.query.status;

    const requests = await WhRequest.find(filter).sort({ dateRequested: -1 }).limit(200);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const customerId =
      req.auth!.role === "customer" ? req.auth!.customerId : req.body.customerId;
    if (!customerId) {
      res.status(400).json({ error: "customerId required" });
      return;
    }
    const request = await WhRequest.create({
      ...req.body,
      companyId: req.auth!.companyId,
      customerId,
      dateRequested: new Date(),
    });
    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const request = await WhRequest.findOneAndUpdate(
      { _id: req.params.id, companyId: req.auth!.companyId },
      { $set: req.body },
      { new: true }
    );
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

export default router;
