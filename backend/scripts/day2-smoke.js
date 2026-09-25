const http = require("http");

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 4000,
        path: `/api${path}`,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {}
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const login = await request("POST", "/auth/login", {
    email: "admin@phoenixcrossdock.com",
    password: "ChangeMe123!",
  });
  if (login.status !== 200) throw new Error("login failed " + JSON.stringify(login));
  const token = login.json.token;

  const customers = await request("GET", "/customers", null, token);
  const warehouses = await request("GET", "/warehouses", null, token);
  const sba = customers.json.customers.find((c) => c.billingMethod === "contract");
  const wh = warehouses.json.warehouses[0];
  const locs = await request(
    "GET",
    `/locations?warehouseId=${wh._id}&available=true`,
    null,
    token
  );

  const receive = await request(
    "POST",
    "/shipments/receive",
    {
      warehouseId: wh._id,
      customerId: sba._id,
      palletCount: 2,
      description: "Day2 demo inbound",
      ref: "DEMO-BOL-001",
      locationIds: (locs.json.locations || []).slice(0, 2).map((l) => l._id),
    },
    token
  );
  console.log("receive", receive.status, receive.json.pallets?.map((p) => p.externalId));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
  const inv = await request(
    "POST",
    "/invoices/generate-sba-month",
    { customerId: sba._id, periodStart: start, periodEnd: end },
    token
  );
  console.log("invoice", inv.status, inv.json.invoice?.number, inv.json.invoice?.total, "charges", inv.json.chargesAttached);

  const dash = await request("GET", "/dashboard", null, token);
  console.log("dashboard kpis", dash.json.kpis);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
