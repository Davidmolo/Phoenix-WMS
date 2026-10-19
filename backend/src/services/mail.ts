import nodemailer from "nodemailer";
import { env } from "../config/env";

function smtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

export function assertMailConfigured() {
  if (!smtpConfigured()) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM in backend/.env so portal invites reach the customer's inbox."
    );
  }
}

function transporter() {
  assertMailConfigured();
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      // Gmail App Passwords are often copied with spaces — strip them
      pass: env.smtpPass.replace(/\s+/g, ""),
    },
  });
}

export async function sendPortalInviteEmail(opts: {
  to: string;
  name: string;
  inviteUrl: string;
  expiresAt: Date;
}) {
  const contact = opts.name || opts.to;
  const expiresLabel = opts.expiresAt.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const info = await transporter().sendMail({
    from: env.mailFrom,
    to: opts.to,
    subject: "Set your Phoenix Cross Dock portal password",
    text: [
      `Hi ${contact},`,
      "",
      "You have been invited to the Phoenix Cross Dock customer portal.",
      "Open this link to set your password (expires in 7 days):",
      opts.inviteUrl,
      "",
      `Link expires: ${expiresLabel} (Phoenix time)`,
      "",
      "If you did not expect this email, you can ignore it.",
    ].join("\n"),
    html: `
      <p>Hi ${escapeHtml(contact)},</p>
      <p>You have been invited to the <strong>Phoenix Cross Dock</strong> customer portal.</p>
      <p><a href="${opts.inviteUrl}" style="display:inline-block;padding:10px 16px;background:#E6A030;color:#0b1f33;text-decoration:none;border-radius:8px;font-weight:700">Set your password</a></p>
      <p style="color:#555;font-size:13px">Or paste this link into your browser:<br/><a href="${opts.inviteUrl}">${opts.inviteUrl}</a></p>
      <p style="color:#555;font-size:13px">This link expires ${escapeHtml(expiresLabel)} (Phoenix time).</p>
    `,
  });

  console.info(`[mail] portal invite → ${opts.to} messageId=${info.messageId}`);
  return info;
}

export async function sendInvoiceEmail(opts: {
  to: string;
  name: string;
  invoiceNumber: string;
  total: number;
  portalUrl: string;
  zelleHint?: string;
}) {
  const contact = opts.name || opts.to;
  const totalLabel = `$${Number(opts.total || 0).toFixed(2)}`;
  const info = await transporter().sendMail({
    from: env.mailFrom,
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} — Phoenix Cross Dock`,
    text: [
      `Hi ${contact},`,
      "",
      `Your invoice ${opts.invoiceNumber} for ${totalLabel} is ready.`,
      `View and pay in the portal: ${opts.portalUrl}`,
      "",
      "Prefer QuickBooks Pay? When we email via QuickBooks, use the Pay Now button in that email.",
      opts.zelleHint ? `\nZelle: ${opts.zelleHint}` : "",
      "",
      "Thank you,",
      "Phoenix Cross Dock",
    ].join("\n"),
    html: `
      <p>Hi ${escapeHtml(contact)},</p>
      <p>Your invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> for <strong>${escapeHtml(totalLabel)}</strong> is ready.</p>
      <p><a href="${opts.portalUrl}" style="display:inline-block;padding:10px 16px;background:#E6A030;color:#0b1f33;text-decoration:none;border-radius:8px;font-weight:700">View &amp; pay in portal</a></p>
      <p style="color:#555;font-size:13px">When this invoice is emailed through QuickBooks, use the <strong>Pay Now</strong> button in that message to pay by card/ACH.</p>
      ${opts.zelleHint ? `<p style="color:#555;font-size:13px">Zelle: ${escapeHtml(opts.zelleHint)}</p>` : ""}
      <p>Thank you,<br/>Phoenix Cross Dock</p>
    `,
  });
  console.info(`[mail] invoice ${opts.invoiceNumber} → ${opts.to} messageId=${info.messageId}`);
  return info;
}

/**
 * Cesar: email ops when a new booking lands from the public website or customer portal.
 * Failures should not block booking creation — caller catches / logs.
 */
export async function sendBookingNotifyEmail(opts: {
  to?: string;
  bookingId: string;
  source: string;
  serviceLabel: string;
  startsAt: Date;
  endsAt?: Date | null;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  notes?: string;
  palletCount?: number | null;
  trailerNumber?: string;
  slotLabel?: string;
}) {
  if (!smtpConfigured()) {
    console.warn("[mail] booking notify skipped — SMTP not configured");
    return null;
  }
  const to = String(opts.to || env.bookingNotifyEmail || "").trim();
  if (!to) {
    console.warn("[mail] booking notify skipped — BOOKING_NOTIFY_EMAIL empty");
    return null;
  }

  const when = opts.startsAt.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "full",
    timeStyle: "short",
  });
  const sourceLabel =
    opts.source === "web"
      ? "Website"
      : opts.source === "portal"
        ? "Customer portal"
        : opts.source;

  const lines = [
    `New dock booking (${sourceLabel})`,
    "",
    `Service: ${opts.serviceLabel}`,
    `When: ${when} (Phoenix time)`,
    opts.slotLabel ? `Slot: ${opts.slotLabel}` : null,
    `Company: ${opts.companyName || "—"}`,
    `Contact: ${opts.contactName || "—"}`,
    `Phone: ${opts.phone || "—"}`,
    `Email: ${opts.email || "—"}`,
    opts.palletCount != null ? `Pallets: ${opts.palletCount}` : null,
    opts.trailerNumber ? `Trailer: ${opts.trailerNumber}` : null,
    opts.notes ? `Notes: ${opts.notes}` : null,
    "",
    `Booking ID: ${opts.bookingId}`,
  ].filter((x) => x != null) as string[];

  const palletsLabel = opts.palletCount != null ? String(opts.palletCount) : "—";

  const info = await transporter().sendMail({
    from: env.mailFrom,
    to,
    subject: `New booking — ${opts.serviceLabel} · ${opts.companyName || "Customer"} (${sourceLabel})`,
    text: lines.join("\n"),
    html: `
      <p><strong>New dock booking</strong> from the <strong>${escapeHtml(sourceLabel)}</strong>.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0">
        <div style="background:#0b1f33;color:#fff;padding:12px 16px;border-radius:8px;min-width:180px">
          <div style="font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.04em">When (Phoenix)</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${escapeHtml(when)}</div>
        </div>
        <div style="background:#E6A030;color:#0b1f33;padding:12px 16px;border-radius:8px;min-width:120px">
          <div style="font-size:11px;opacity:.85;text-transform:uppercase;letter-spacing:.04em">Pallets</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${escapeHtml(palletsLabel)}</div>
        </div>
      </div>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#555">Service</td><td><strong>${escapeHtml(opts.serviceLabel)}</strong></td></tr>
        ${opts.slotLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Slot</td><td>${escapeHtml(opts.slotLabel)}</td></tr>` : ""}
        <tr><td style="padding:4px 12px 4px 0;color:#555">Company</td><td>${escapeHtml(opts.companyName || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Contact</td><td>${escapeHtml(opts.contactName || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Phone</td><td>${escapeHtml(opts.phone || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td>${escapeHtml(opts.email || "—")}</td></tr>
        ${opts.trailerNumber ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Trailer</td><td>${escapeHtml(opts.trailerNumber)}</td></tr>` : ""}
        ${opts.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Notes</td><td>${escapeHtml(opts.notes)}</td></tr>` : ""}
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px">Booking ID: ${escapeHtml(opts.bookingId)}</p>
    `,
  });

  console.info(`[mail] booking notify → ${to} booking=${opts.bookingId} messageId=${info.messageId}`);
  return info;
}

/** Cesar/Darya Oct 12: website Request for info (booking disabled until warehouse ready). */
export async function sendInquiryNotifyEmail(opts: {
  to?: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  serviceInterest?: string;
  palletCount?: string | number | null;
  message?: string;
  origin?: string;
  destination?: string;
}) {
  if (!smtpConfigured()) {
    console.warn("[mail] inquiry notify skipped — SMTP not configured");
    return null;
  }
  const to = String(opts.to || env.bookingNotifyEmail || "").trim();
  if (!to) {
    console.warn("[mail] inquiry notify skipped — BOOKING_NOTIFY_EMAIL empty");
    return null;
  }

  const pallets =
    opts.palletCount != null && String(opts.palletCount).trim() !== ""
      ? String(opts.palletCount)
      : "—";

  const info = await transporter().sendMail({
    from: env.mailFrom,
    to,
    replyTo: opts.email || undefined,
    subject: `Request for info — ${opts.companyName || "Lead"} · ${opts.contactName || ""}`.trim(),
    text: [
      "New website request for information",
      "",
      `Company: ${opts.companyName || "—"}`,
      `Contact: ${opts.contactName || "—"}`,
      `Phone: ${opts.phone || "—"}`,
      `Email: ${opts.email || "—"}`,
      `Service interest: ${opts.serviceInterest || "—"}`,
      `Pallets: ${pallets}`,
      opts.origin ? `Origin: ${opts.origin}` : null,
      opts.destination ? `Destination: ${opts.destination}` : null,
      opts.message ? `Message: ${opts.message}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <p><strong>Request for information</strong> from the website (dock booking is off).</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0">
        <div style="background:#E6A030;color:#0b1f33;padding:12px 16px;border-radius:8px;min-width:120px">
          <div style="font-size:11px;opacity:.85;text-transform:uppercase">Pallets</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${escapeHtml(pallets)}</div>
        </div>
        <div style="background:#0b1f33;color:#fff;padding:12px 16px;border-radius:8px;min-width:160px">
          <div style="font-size:11px;opacity:.8;text-transform:uppercase">Service interest</div>
          <div style="font-size:15px;font-weight:700;margin-top:4px">${escapeHtml(opts.serviceInterest || "—")}</div>
        </div>
      </div>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#555">Company</td><td><strong>${escapeHtml(opts.companyName || "—")}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Contact</td><td>${escapeHtml(opts.contactName || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Phone</td><td><a href="tel:${escapeHtml(opts.phone || "")}">${escapeHtml(opts.phone || "—")}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td><a href="mailto:${escapeHtml(opts.email || "")}">${escapeHtml(opts.email || "—")}</a></td></tr>
        ${opts.origin ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Origin</td><td>${escapeHtml(opts.origin)}</td></tr>` : ""}
        ${opts.destination ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Destination</td><td>${escapeHtml(opts.destination)}</td></tr>` : ""}
        ${opts.message ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Message</td><td>${escapeHtml(opts.message)}</td></tr>` : ""}
      </table>
    `,
  });

  console.info(`[mail] inquiry notify → ${to} from=${opts.email} messageId=${info.messageId}`);
  return info;
}

export async function sendWarehouseRequestEmail(opts: {
  to?: string;
  customerName: string;
  type: string;
  qty: number;
  ref?: string;
  notes?: string;
}) {
  if (!smtpConfigured()) {
    console.warn("[mail] request notify skipped — SMTP not configured");
    return null;
  }
  const to = String(opts.to || env.bookingNotifyEmail || "").trim();
  if (!to) return null;
  const info = await transporter().sendMail({
    from: env.mailFrom || env.smtpUser,
    to,
    subject: `New ${opts.type} request — ${opts.customerName}`,
    text: [
      `New warehouse request`,
      `Customer: ${opts.customerName}`,
      `Type: ${opts.type}`,
      `Qty: ${opts.qty}`,
      opts.ref ? `PO / Job: ${opts.ref}` : null,
      opts.notes ? `Notes: ${opts.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  console.info(`[mail] request notify → ${to} messageId=${info.messageId}`);
  return info;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
