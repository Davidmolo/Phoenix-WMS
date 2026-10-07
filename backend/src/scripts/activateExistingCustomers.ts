import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/phoenix_wms");
  const r = await mongoose.connection.db!.collection("customers").updateMany(
    { portalActivated: { $exists: false } },
    { $set: { portalActivated: true } }
  );
  console.log("activated existing", r.modifiedCount);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
