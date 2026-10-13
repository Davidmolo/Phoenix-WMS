/** OpenAPI 3 spec for Darya / marketing-site public dock booking APIs (no auth). */
export const publicBookingsOpenApi = {
  openapi: "3.0.3",
  info: {
    title: "Phoenix Cross Dock — Public Dock Booking API",
    version: "1.0.0",
    description:
      "Public endpoints for the phoenixcrossdocks.com website (and other Phoenix marketing sites). " +
      "No authentication required.\n\n" +
      "**Oct 12 / Cesar:** Confirmed dock booking (`POST /public/bookings`) is **disabled by default** " +
      "until the warehouse is ready (`PUBLIC_BOOKING_ENABLED=true` to re-open). " +
      "Use **`POST /public/bookings/inquiry`** for Request for information — emails Cesar " +
      "(`BOOKING_NOTIFY_EMAIL`). When booking is re-enabled, `POST /public/bookings` also emails Cesar.\n\n" +
      "**Service types:** `crossdock` (45 min, both doors), `drop_and_store` (45 min, one door), " +
      "`trailer_rework` (1 hour, one door).\n\n" +
      "**Hours:** 8:00 AM – 6:00 PM America/Phoenix. Slot status: `available` | `booked` | `held` | `blocked` | `past`.",
  },
  servers: [
    {
      url: "https://wms.phoenixcrossdocks.com/api",
      description: "Production",
    },
    {
      url: "http://localhost:4020/api",
      description: "Local API",
    },
  ],
  tags: [{ name: "Public bookings", description: "No auth — for website integration" }],
  paths: {
    "/public/bookings": {
      get: {
        tags: ["Public bookings"],
        summary: "API index (links + quick start)",
        responses: {
          "200": {
            description: "Endpoint list for integrators",
          },
        },
      },
    },
    "/public/bookings/config": {
      get: {
        tags: ["Public bookings"],
        summary: "Company + service types + hours",
        description:
          "Call once on page load. Includes `publicBookingEnabled` — if false, show Request for info and call `/inquiry` instead of creating a booking.",
        responses: {
          "200": {
            description: "Config payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConfigResponse" },
              },
            },
          },
        },
      },
    },
    "/public/bookings/calendar": {
      get: {
        tags: ["Public bookings"],
        summary: "Month calendar (which days have open slots)",
        parameters: [
          {
            name: "year",
            in: "query",
            schema: { type: "integer", example: 2026 },
          },
          {
            name: "month",
            in: "query",
            description: "1–12",
            schema: { type: "integer", example: 10 },
          },
          {
            name: "serviceType",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: ["crossdock", "trailer_rework", "drop_and_store"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Days with availability dots",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CalendarResponse" },
              },
            },
          },
        },
      },
    },
    "/public/bookings/slots": {
      get: {
        tags: ["Public bookings"],
        summary: "Day slots — available vs reserved",
        description:
          "Primary endpoint for the booking UI. Each slot has `status`. Treat `available` as bookable; " +
          "`booked` / `held` / `blocked` / `past` as not selectable. Customer PII is omitted on public reserved chips.",
        parameters: [
          {
            name: "date",
            in: "query",
            required: true,
            description: "YYYY-MM-DD (Phoenix local date)",
            schema: { type: "string", example: "2026-10-08" },
          },
          {
            name: "serviceType",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: ["crossdock", "trailer_rework", "drop_and_store"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Slot grid for the day",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SlotsResponse" },
              },
            },
          },
        },
      },
    },
    "/public/bookings/inquiry": {
      post: {
        tags: ["Public bookings"],
        summary: "Request for information (emails Cesar)",
        description:
          "Primary website form while dock booking is paused. Does **not** create a Booking or reserve a slot. " +
          "Sends an email to Cesar / ops (`BOOKING_NOTIFY_EMAIL`). Use this from Darya’s marketing site.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InquiryBody" },
              example: {
                companyName: "Summit Freight",
                contactName: "Jordan Lee",
                phone: "(623) 555-0100",
                email: "jordan@example.com",
                serviceInterest: "crossdock",
                palletCount: 12,
                origin: "Los Angeles, CA",
                destination: "Phoenix, AZ",
                message: "Need dock space next week",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Inquiry accepted; Cesar notified by email",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InquiryResponse" },
              },
            },
          },
          "400": {
            description: "Missing company, contact, phone, or email",
          },
        },
      },
    },
    "/public/bookings/": {
      post: {
        tags: ["Public bookings"],
        summary: "Create a website booking (disabled by default)",
        description:
          "Confirm a slot after the user picks an `available` `startsAt` from `/slots`. " +
          "Returns **403** when `PUBLIC_BOOKING_ENABLED` is not true — use `/inquiry` instead. " +
          "When enabled, creates a booking and emails Cesar.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateBookingBody" },
              example: {
                serviceType: "trailer_rework",
                startsAt: "2026-10-08T16:00:00.000Z",
                companyName: "Summit Freight",
                contactName: "Jordan Lee",
                phone: "(623) 555-0100",
                email: "jordan@example.com",
                notes: "Inbound from LA",
                freight: { trailerNumber: "53ft dry", palletCount: 12 },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Booking confirmed; Cesar notified by email",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateBookingResponse" },
              },
            },
          },
          "403": {
            description: "Public booking disabled — use POST /public/bookings/inquiry",
          },
          "409": {
            description: "Slot no longer available",
          },
        },
      },
    },
  },
  components: {
    schemas: {
      InquiryBody: {
        type: "object",
        required: ["companyName", "contactName", "phone", "email"],
        properties: {
          companyName: { type: "string" },
          contactName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string", format: "email" },
          serviceInterest: {
            type: "string",
            description: "e.g. crossdock | trailer_rework | drop_and_store",
          },
          palletCount: { type: "number", nullable: true },
          origin: { type: "string" },
          destination: { type: "string" },
          message: { type: "string" },
          notes: { type: "string", description: "Alias for message" },
        },
      },
      InquiryResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          message: { type: "string" },
        },
      },
      ConfigResponse: {
        type: "object",
        properties: {
          publicBookingEnabled: {
            type: "boolean",
            description: "If false, use POST /inquiry only (no confirmed slots).",
          },
          company: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: { type: "string" },
              city: { type: "string" },
            },
          },
          defaults: {
            type: "object",
            properties: {
              workdayStartHour: { type: "integer", example: 8 },
              workdayEndHour: { type: "integer", example: 18 },
              bufferMinutes: { type: "integer", example: 15 },
              timezone: { type: "string", example: "America/Phoenix" },
              totalDocks: { type: "integer", example: 2 },
            },
          },
          serviceTypes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                durationMinutes: { type: "integer" },
                dockUnits: { type: "integer" },
              },
            },
          },
        },
      },
      CalendarDay: {
        type: "object",
        properties: {
          date: { type: "string", example: "2026-10-08" },
          availableCount: { type: "integer" },
          bookedCount: { type: "integer" },
          bookingStarts: { type: "integer" },
          dot: {
            type: "string",
            enum: ["available", "mixed", "booked", "none"],
          },
        },
      },
      CalendarResponse: {
        type: "object",
        properties: {
          year: { type: "integer" },
          month: { type: "integer" },
          serviceType: { type: "string" },
          today: { type: "string" },
          days: { type: "array", items: { $ref: "#/components/schemas/CalendarDay" } },
        },
      },
      Slot: {
        type: "object",
        properties: {
          startIso: { type: "string", format: "date-time" },
          endIso: { type: "string", format: "date-time" },
          label: { type: "string", example: "8:00 AM" },
          status: {
            type: "string",
            enum: ["available", "booked", "held", "blocked", "past"],
          },
          bookedCount: { type: "integer" },
          capacity: { type: "integer" },
        },
      },
      SlotsResponse: {
        type: "object",
        properties: {
          date: { type: "string" },
          serviceType: { type: "string" },
          slots: { type: "array", items: { $ref: "#/components/schemas/Slot" } },
          nextAvailable: { nullable: true, allOf: [{ $ref: "#/components/schemas/Slot" }] },
        },
      },
      CreateBookingBody: {
        type: "object",
        required: ["serviceType", "startsAt", "companyName", "contactName", "phone", "email"],
        properties: {
          serviceType: {
            type: "string",
            enum: ["crossdock", "trailer_rework", "drop_and_store"],
          },
          startsAt: {
            type: "string",
            format: "date-time",
            description: "Must match an `available` slot `startIso` from /slots",
          },
          companyName: { type: "string" },
          contactName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string", format: "email" },
          notes: { type: "string" },
          freight: {
            type: "object",
            properties: {
              trailerNumber: { type: "string" },
              palletCount: { type: "number", nullable: true },
              weightLbs: { type: "number", nullable: true },
              details: { type: "string" },
            },
          },
        },
      },
      CreateBookingResponse: {
        type: "object",
        properties: {
          booking: { type: "object" },
          slot: { $ref: "#/components/schemas/Slot" },
          message: { type: "string" },
        },
      },
    },
  },
} as const;
