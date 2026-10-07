import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { User } from "../models/User";
import { Customer } from "../models/Customer";
import { sendPortalInviteEmail } from "./mail";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string) {
  return `${env.appUrl.replace(/\/$/, "")}/invite/${token}`;
}

export async function issuePortalInvite(opts: {
  companyId: string;
  customerId: string;
  email: string;
  name: string;
}) {
  const email = opts.email.trim().toLowerCase();
  const name = opts.name.trim() || email;
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required to invite this customer");
  }

  const customer = await Customer.findOne({ _id: opts.customerId, companyId: opts.companyId });
  if (!customer) throw new Error("Customer not found");

  const clash = await User.findOne({
    companyId: opts.companyId,
    email,
    $nor: [{ customerId: customer._id, role: "customer" }],
  });
  if (clash) {
    if (clash.role === "customer") {
      const linked =
        clash.customerId &&
        (await Customer.findOne({ _id: clash.customerId, companyId: opts.companyId }));
      if (!linked) {
        // Orphan portal login left after a customer was deleted — reclaim for this invite
        clash.customerId = customer._id;
        await clash.save();
      } else {
        throw new Error("That email is already used by another user");
      }
    } else {
      throw new Error("That email is already used by another user");
    }
  }

  let user = await User.findOne({ companyId: opts.companyId, customerId: customer._id, role: "customer" });
  if (!user) {
    user = await User.findOne({ companyId: opts.companyId, email, role: "customer" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
  const expires = new Date(Date.now() + INVITE_TTL_MS);

  if (user) {
    if (user.role !== "customer") throw new Error("That email is already used by another user");
    user.email = email;
    user.name = name;
    user.customerId = customer._id;
    user.active = true;
    user.passwordHash = placeholderHash;
    user.inviteTokenHash = hashInviteToken(token);
    user.inviteExpiresAt = expires;
    user.inviteSentAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      companyId: opts.companyId,
      email,
      name,
      role: "customer",
      customerId: customer._id,
      active: true,
      passwordHash: placeholderHash,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: expires,
      inviteSentAt: new Date(),
    });
  }

  customer.email = email;
  if (!customer.contact && name) customer.contact = name;
  customer.portalActivated = false;
  await customer.save();

  const url = inviteUrl(token);
  await sendPortalInviteEmail({
    to: email,
    name,
    inviteUrl: url,
    expiresAt: expires,
  });

  return {
    inviteUrl: url,
    email,
    expiresAt: expires.toISOString(),
    userId: String(user._id),
    emailed: true,
  };
}

export async function loadInvite(rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) return null;
  const user = await User.findOne({
    inviteTokenHash: hashInviteToken(token),
    active: true,
    role: "customer",
  });
  if (!user || !user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) return null;
  return user;
}

/** Mark customer visible on the Customers list after password is set. */
export async function activateCustomerPortal(user: {
  companyId: unknown;
  customerId?: unknown;
}) {
  if (!user.customerId) return;
  await Customer.updateOne(
    { _id: user.customerId, companyId: user.companyId },
    { $set: { portalActivated: true } }
  );
}
