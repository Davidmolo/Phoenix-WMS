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
  /** 5-field cron: minute hour day-of-month month day-of-week */
  quickbooksSyncCron: process.env.QUICKBOOKS_SYNC_CRON || "*/15 * * * *",
  quickbooksSyncOnBoot: process.env.QUICKBOOKS_SYNC_ON_BOOT !== "false",
};
