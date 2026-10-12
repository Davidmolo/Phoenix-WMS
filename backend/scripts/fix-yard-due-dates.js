/**
 * Cesar: crossdock + rework invoices are due same day.
 * Backfill local WMS invoices and patch DueDate in QuickBooks.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const AUTH_URL_TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function apiHost() {
  return process.env.QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

async function refreshIfNeeded(conn) {
  const skew = 60_000;
  if (conn.accessTokenExpiresAt.getTime() > Date.now() + skew) return conn;
  const raw = `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`;
  const res = await fetch(AUTH_URL_TOKEN, {
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
  if (!res.ok) throw new Error(data.error_description || data.error || "token refresh failed");
  const now = Date.now();
  await mongoose.connection.db.collection("quickbooksconnections").updateOne(
    { _id: conn._id },
    {
      $set: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || conn.refreshToken,
        accessTokenExpiresAt: new Date(now + data.expires_in * 1000),
      },
    }
  );
  conn.accessToken = data.access_token;
  return conn;
}

async function qbGet(conn, path) {
  const url = `${apiHost()}/v3/company/${conn.realmId}/${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${conn.accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail || data?.Fault?.Error?.[0]?.Message || res.status;
    throw new Error(String(msg));
  }
  return data;
}

async function qbPost(conn, path, body) {
  const url = `${apiHost()}/v3/company/${conn.realmId}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${conn.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail || data?.Fault?.Error?.[0]?.Message || res.status;
    throw new Error(String(msg));
  }
  return data;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let conn = await mongoose.connection.db.collection("quickbooksconnections").findOne({});
  if (!conn) throw new Error("No QuickBooks connection");
  conn = await refreshIfNeeded(conn);

  const invoices = await mongoose.connection.db
    .collection("invoices")
    .find({
      $or: [
        { sourceType: "yard_job" },
        { wmsJobKey: { $regex: /^yard:/ } },
        { notes: { $regex: /yard job/i } },
      ],
    })
    .toArray();

  console.log(`Found ${invoices.length} yard-related invoice(s)`);

  for (const inv of invoices) {
    const sameDay = inv.periodEnd ? new Date(inv.periodEnd) : new Date(inv.createdAt);
    await mongoose.connection.db.collection("invoices").updateOne(
      { _id: inv._id },
      { $set: { termsDays: 0, dueDate: sameDay } }
    );
    console.log(`WMS ${inv.number}: dueDate → ${ymd(sameDay)}`);

    if (!inv.quickbooksId) {
      console.log(`  (no QB id — local only)`);
      continue;
    }

    try {
      const got = await qbGet(conn, `invoice/${inv.quickbooksId}?minorversion=65`);
      const qbInv = got.Invoice;
      if (!qbInv?.Id || qbInv.SyncToken == null) {
        console.log(`  QB ${inv.quickbooksId}: could not load SyncToken`);
        continue;
      }
      await qbPost(conn, "invoice?minorversion=65", {
        sparse: true,
        Id: String(qbInv.Id),
        SyncToken: String(qbInv.SyncToken),
        DueDate: ymd(sameDay),
      });
      console.log(`  QB Id ${inv.quickbooksId}: DueDate → ${ymd(sameDay)}`);
    } catch (e) {
      console.error(`  QB Id ${inv.quickbooksId} failed:`, e.message || e);
    }
  }

  await mongoose.disconnect();
  console.log("Done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
