import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const EMAIL = "shahmeer@azfsllc.com";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/phoenix_wms");
  const db = mongoose.connection.db!;

  const users = await db.collection("users").find({ email: EMAIL }).toArray();
  const customersByEmail = await db.collection("customers").find({ email: EMAIL }).toArray();
  const customerIds = [
    ...users.map((u) => u.customerId).filter(Boolean),
    ...customersByEmail.map((c) => c._id),
  ];
  const uniqueIds = [...new Map(customerIds.map((id) => [String(id), id])).values()];
  const customers = uniqueIds.length
    ? await db.collection("customers").find({ _id: { $in: uniqueIds } }).toArray()
    : [];

  console.log(
    "users",
    users.map((u) => ({
      id: String(u._id),
      email: u.email,
      role: u.role,
      customerId: u.customerId ? String(u.customerId) : null,
      invitePending: Boolean(u.inviteTokenHash),
      companyId: String(u.companyId),
    }))
  );
  console.log(
    "customers",
    customers.map((c) => ({
      id: String(c._id),
      name: c.name,
      email: c.email,
      portalActivated: c.portalActivated,
    }))
  );

  // Also check any user with this email under any company
  const allEmailUsers = await db.collection("users").find({ email: EMAIL }).toArray();
  const userDel = await db.collection("users").deleteMany({ email: EMAIL });
  const custDel = uniqueIds.length
    ? await db.collection("customers").deleteMany({ _id: { $in: uniqueIds } })
    : { deletedCount: 0 };

  console.log(
    "deleted users",
    userDel.deletedCount,
    "customers",
    custDel.deletedCount,
    "(matched email users",
    allEmailUsers.length,
    ")"
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
