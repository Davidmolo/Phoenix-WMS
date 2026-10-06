import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

async function main() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!host || !user || !pass) {
    throw new Error("SMTP env incomplete");
  }
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.verify();
  console.log("SMTP OK for", user, "via", host + ":" + port);
}

main().catch((err) => {
  console.error("SMTP failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
