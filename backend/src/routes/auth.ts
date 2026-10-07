import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { signToken, requireAuth } from "../middleware/auth";
import { loadInvite, activateCustomerPortal } from "../services/portalInvite";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase(), active: true });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (user.inviteTokenHash) {
      res.status(403).json({
        error: "Set your password from the invite email before signing in",
      });
      return;
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = signToken({
      userId: String(user._id),
      companyId: String(user.companyId),
      role: user.role,
      customerId: user.customerId ? String(user.customerId) : null,
      email: user.email,
    });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        customerId: user.customerId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth!.userId).select("-passwordHash");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.get("/invite/:token", async (req, res, next) => {
  try {
    const user = await loadInvite(String(req.params.token));
    if (!user) {
      res.status(400).json({ error: "This invite link is invalid or has expired" });
      return;
    }
    res.json({
      email: user.email,
      name: user.name,
      expiresAt: user.inviteExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/invite/:token", async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const user = await loadInvite(String(req.params.token));
    if (!user) {
      res.status(400).json({ error: "This invite link is invalid or has expired" });
      return;
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.inviteTokenHash = null;
    user.inviteExpiresAt = null;
    await user.save();
    await activateCustomerPortal(user);

    const token = signToken({
      userId: String(user._id),
      companyId: String(user.companyId),
      role: user.role,
      customerId: user.customerId ? String(user.customerId) : null,
      email: user.email,
    });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        customerId: user.customerId,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
