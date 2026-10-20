import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { startQuickBooksSyncCron } from "./jobs/quickbooksSync";
import { startContractMonthlyCron } from "./jobs/contractMonthly";

async function main() {
  await connectDb();

  const uploadsRoot = path.resolve(env.uploadsDir);
  fs.mkdirSync(uploadsRoot, { recursive: true });

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(
    express.json({
      // BOL exception photos as data URLs
      limit: "12mb",
      // Preserve raw body for Intuit webhook signature verification
      verify: (req, _res, buf) => {
        const r = req as express.Request & { rawBody?: Buffer; originalUrl?: string };
        const url = r.originalUrl || r.url || "";
        if (url.includes("/quickbooks/webhook")) {
          r.rawBody = buf;
        }
      },
    })
  );
  app.use("/api/uploads", express.static(uploadsRoot));
  app.use("/api", routes);
  // Signed BOL HTML + exception photos (paths under uploads/)
  app.use("/uploads", express.static(uploadsRoot));
  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
    startQuickBooksSyncCron();
    startContractMonthlyCron();
  });
}

main().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
