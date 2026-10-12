import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { startQuickBooksSyncCron } from "./jobs/quickbooksSync";

async function main() {
  await connectDb();

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: "2mb",
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
  app.use("/api", routes);
  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
    startQuickBooksSyncCron();
  });
}

main().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
