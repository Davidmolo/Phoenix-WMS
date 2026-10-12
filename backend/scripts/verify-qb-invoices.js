/** Verify WMS invoices match QuickBooks: customer, lines total, due date, no missing QB id. */
require("dotenv").config();
const mongoose = require("mongoose");

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function apiHost() {
  return process.env.QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
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

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let conn = await mongoose.connection.db.collection("quickbooksconnections").findOne({});
  if (!conn) throw new Error("No QB connection");
  conn = await refreshIfNeeded(conn);

  const invoices = await mongoose.connection.db
    .collection("invoices")
    .find({ quickbooksId: { $nin: [null, ""] } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  let ok = 0;
  let bad = 0;
  for (const inv of invoices) {
    const url = `${apiHost()}/v3/company/${conn.realmId}/invoice/${inv.quickbooksId}?minorversion=65`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${conn.accessToken}`,
      },
    });
    const data = await res.json();
    const qb = data.Invoice;
    if (!qb) {
      console.log(`FAIL ${inv.number}: QB Id ${inv.quickbooksId} not found`);
      bad += 1;
      continue;
    }
    const wmsDue = inv.dueDate ? ymd(inv.dueDate) : "—";
    const qbDue = qb.DueDate || "—";
    const wmsTotal = Number(inv.total);
    const qbTotal = Number(qb.TotalAmt);
    const hasCustomer = Boolean(qb.CustomerRef?.value);
    const lineCount = (qb.Line || []).filter((l) => l.DetailType === "SalesItemLineDetail").length;
    const issues = [];
    if (!hasCustomer) issues.push("no customer");
    if (lineCount < 1) issues.push("no lines");
    if (Math.abs(wmsTotal - qbTotal) > 0.02) issues.push(`total WMS ${wmsTotal} ≠ QB ${qbTotal}`);
    if (wmsDue !== qbDue) issues.push(`due WMS ${wmsDue} ≠ QB ${qbDue}`);
    if (issues.length) {
      console.log(`FAIL ${inv.number} (QB ${inv.quickbooksId}): ${issues.join("; ")}`);
      bad += 1;
    } else {
      console.log(
        `OK   ${inv.number} QB=${inv.quickbooksId} customer=${qb.CustomerRef.name || qb.CustomerRef.value} lines=${lineCount} total=${qbTotal} due=${qbDue}`
      );
      ok += 1;
    }
  }
  console.log(`\nSummary: ${ok} ok, ${bad} issues (${invoices.length} checked)`);
  await mongoose.disconnect();
  process.exit(bad > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
