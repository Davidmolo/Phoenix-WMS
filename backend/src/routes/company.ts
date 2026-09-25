import { Router } from "express";
import { requireAuth, requireRole, type AuthUser } from "../middleware/auth";
import { Company } from "../models/Company";
import { User } from "../models/User";
import { DEFAULT_FEE_SCHEDULE } from "../constants/feeSchedule";

const router = Router();
router.use(requireAuth);

async function resolveCompany(auth?: AuthUser) {
  if (!auth) return null;
  let company = await Company.findById(auth.companyId);
  if (company) return company;

  // Stale JWT after reseed: resolve via current user record
  const user = await User.findById(auth.userId);
  if (user?.companyId) {
    company = await Company.findById(user.companyId);
  }
  if (company) return company;

  // Last resort: single-tenant Phoenix company
  return Company.findOne({ active: true }).sort({ createdAt: -1 });
}

function feeSchedulePayload(company: InstanceType<typeof Company>) {
  const raw = company.feeSchedule as unknown;
  let asObj: Record<string, unknown> | null = null;

  if (raw && typeof raw === "object") {
    const maybe = raw as { toObject?: () => Record<string, unknown> };
    asObj = typeof maybe.toObject === "function" ? maybe.toObject() : { ...(raw as Record<string, unknown>) };
  }

  if (!asObj || Object.keys(asObj).length === 0) {
    return { ...DEFAULT_FEE_SCHEDULE };
  }
  return { ...DEFAULT_FEE_SCHEDULE, ...asObj };
}

router.get("/", async (req, res, next) => {
  try {
    const company = await resolveCompany(req.auth);
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

/** Fee schedule is company-level (Phoenix Cross Dock published rates). */
router.get("/fee-schedule", async (req, res, next) => {
  try {
    const company = await resolveCompany(req.auth);
    if (!company) {
      res.status(404).json({ error: "Company not found — sign out and sign in again after a reseed" });
      return;
    }
    res.json({
      companyName: company.name,
      companyId: company._id,
      feeSchedule: feeSchedulePayload(company),
      source: "CT_Warehouse_Lease_Proforma §8 + Marketing rate sheet",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/fee-schedule", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const company = await resolveCompany(req.auth);
    if (!company) {
      res.status(404).json({ error: "Company not found — sign out and sign in again after a reseed" });
      return;
    }
    const current = feeSchedulePayload(company);
    company.set("feeSchedule", { ...current, ...req.body });
    await company.save();
    res.json({ feeSchedule: company.feeSchedule });
  } catch (err) {
    next(err);
  }
});

export default router;
