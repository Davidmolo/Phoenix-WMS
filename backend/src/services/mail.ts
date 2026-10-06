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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
