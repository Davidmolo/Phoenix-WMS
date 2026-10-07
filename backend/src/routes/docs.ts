import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { publicBookingsOpenApi } from "../openapi/publicBookings";

const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.json(publicBookingsOpenApi);
});

router.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(publicBookingsOpenApi, {
    customSiteTitle: "Phoenix WMS — Public Booking API",
    swaggerOptions: {
      persistAuthorization: false,
      displayRequestDuration: true,
    },
  })
);

export default router;
