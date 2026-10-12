/**
 * Backfill BillEmail on all WMS→QB invoices + PrimaryEmailAddr on linked customers.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function apiHost() {
  return process.env.QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function refreshIfNeeded(conn) {
  if (conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return conn;
  const raw = `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(raw).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "refresh failed");
  await mongoose.connection.db.collection("quickbooksconnections").updateOne(
    { _id: conn._id },
    {
      $set: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || conn.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    }
  );
  conn.accessToken = data.access_token;
  return conn;
}

async function qb(conn, method, path, body) {
  const url = `${apiHost()}/v3/company/${conn.realmId}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${conn.accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.Fault?.Error?.[0]?.Detail || data?.Fault?.Error?.[0]?.Message || String(res.status)
    );
  }
  return data;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let conn = await mongoose.connection.db.collection("quickbooksconnections").findOne({});
  if (!conn) throw new Error("No QB connection");
  conn = await refreshIfNeeded(conn);

  const invoices = await mongoose.connection.db
    .collection("invoices")
    .find({ quickbooksId: { $nin: [null, ""] } })
    .toArray();

  const syncedCustomers = new Set();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const inv of invoices) {
    const customer = await mongoose.connection.db.collection("customers").findOne({
      _id: inv.customerId,
    });
    const email = String(customer?.email || "").trim();
    if (!email || !email.includes("@")) {
      console.log(`SKIP ${inv.number}: no WMS email for customer`);
      skipped += 1;
      continue;
    }

    try {
      // Sync customer PrimaryEmailAddr once per QB customer
      const qbCustId = customer.quickbooksCustomerId ? String(customer.quickbooksCustomerId) : null;
      if (qbCustId && !syncedCustomers.has(qbCustId)) {
        const cust = await qb(conn, "GET", `customer/${qbCustId}?minorversion=65`);
        const current = String(cust.Customer?.PrimaryEmailAddr?.Address || "").trim().toLowerCase();
        if (current !== email.toLowerCase()) {
          await qb(conn, "POST", "customer?minorversion=65", {
            sparse: true,
            Id: cust.Customer.Id,
            SyncToken: cust.Customer.SyncToken,
            PrimaryEmailAddr: { Address: email },
          });
          console.log(`customer ${customer.name} (${qbCustId}) email → ${email}`);
        }
        syncedCustomers.add(qbCustId);
      }

      const got = await qb(conn, "GET", `invoice/${inv.quickbooksId}?minorversion=65`);
      const currentBill = String(got.Invoice?.BillEmail?.Address || "").trim().toLowerCase();
      if (currentBill === email.toLowerCase()) {
        console.log(`OK   ${inv.number}: already ${email}`);
        ok += 1;
        continue;
      }
      await qb(conn, "POST", "invoice?minorversion=65", {
        sparse: true,
        Id: got.Invoice.Id,
        SyncToken: got.Invoice.SyncToken,
        BillEmail: { Address: email },
      });
      console.log(`FIX  ${inv.number} (QB ${inv.quickbooksId}): BillEmail → ${email}`);
      ok += 1;
    } catch (e) {
      console.error(`FAIL ${inv.number}:`, e.message || e);
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} ok/fixed, ${skipped} skipped, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
