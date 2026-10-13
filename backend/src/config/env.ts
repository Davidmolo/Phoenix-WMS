import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/phoenix_wms",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || "Phoenix Cross Dock <noreply@phoenixcrossdock.com>",
  /**
   * Ops alert when a new dock booking is created from the public website or customer portal.
   * Cesar: always notified so the dock can prep.
   */
  bookingNotifyEmail:
    process.env.BOOKING_NOTIFY_EMAIL || "cesar@phoenixcrossdocks.com",
  /**
   * Cesar/Darya Oct 12: public website must NOT confirm dock bookings until warehouse is ready.
   * Default off — use Request for info instead. Set PUBLIC_BOOKING_ENABLED=true to re-open.
   */
  publicBookingEnabled: process.env.PUBLIC_BOOKING_ENABLED === "true",
  /** Local disk for BOL documents + exception photos (relative to process cwd unless absolute). */
  uploadsDir: process.env.UPLOADS_DIR || "uploads",
  /**
   * When false, never push invoices to QuickBooks (local WMS register only).
   * Use with sandbox testing or while production QBO must stay untouched.
   * Individual customers with testAccount=true are also never pushed.
   */
  quickbooksPushEnabled: process.env.QUICKBOOKS_PUSH_ENABLED !== "false",
  /** QuickBooks Online — Development (sandbox) first; Production later */
  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID || "",
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || "",
  quickbooksRedirectUri:
    process.env.QUICKBOOKS_REDIRECT_URI ||
    `${process.env.APP_URL || "http://localhost:4000"}/api/quickbooks/callback`,
  /** "sandbox" | "production" */
  quickbooksEnv: (process.env.QUICKBOOKS_ENV || "sandbox") as "sandbox" | "production",
  /**
   * Background invoice sync from QuickBooks → Mongo.
   * Default every 15 minutes. Staff can still Sync manually anytime.
   */
  quickbooksSyncEnabled: process.env.QUICKBOOKS_SYNC_ENABLED !== "false",
  /** 5-field cron: minute hour day-of-month month day-of-week (backup if webhooks miss) */
  quickbooksSyncCron: process.env.QUICKBOOKS_SYNC_CRON || "*/5 * * * *",
  quickbooksSyncOnBoot: process.env.QUICKBOOKS_SYNC_ON_BOOT !== "false",
  /**
   * Intuit Developer → Webhooks verifier token.
   * Endpoint: POST {APP}/api/quickbooks/webhook
   */
  quickbooksWebhookVerifier: process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN || "",
};
