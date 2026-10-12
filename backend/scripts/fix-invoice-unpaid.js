/** Reclassify open invoices: unpaid (before due) vs past_due (after due). */
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const now = Date.now();
  const col = mongoose.connection.db.collection("invoices");
  const open = await col
    .find({
      status: { $nin: ["paid", "void"] },
      $or: [{ balanceDue: { $gt: 0 } }, { balanceDue: null, total: { $gt: 0 } }],
    })
    .toArray();

  let unpaid = 0;
  let pastDue = 0;
  for (const inv of open) {
    const bal = inv.balanceDue != null ? Number(inv.balanceDue) : Number(inv.total) || 0;
    if (bal <= 0) continue;
    const due = inv.dueDate ? new Date(inv.dueDate).getTime() : null;
    const next = due != null && due < now ? "past_due" : "unpaid";
    if (inv.status === next) continue;
    await col.updateOne({ _id: inv._id }, { $set: { status: next } });
    console.log(`${inv.number}: ${inv.status} → ${next}`);
    if (next === "unpaid") unpaid += 1;
    else pastDue += 1;
  }
  console.log(`Updated unpaid=${unpaid} past_due=${pastDue}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
