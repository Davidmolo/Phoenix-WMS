import { Pallet } from "../models/Pallet";
import { Lpn } from "../models/Lpn";

export async function nextPalletExternalId(companyId: string): Promise<string> {
  const count = await Pallet.countDocuments({ companyId });
  return `PLT-${20001 + count}`;
}

export async function nextLpnCode(companyId: string): Promise<string> {
  const rows = await Lpn.find({ companyId }).select("code").lean();
  let max = 10000;
  for (const row of rows) {
    const match = /^LPN-(\d+)$/.exec(String(row.code || ""));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `LPN-${max + 1}`;
}

function isDuplicateKey(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|E11000/i.test(msg);
}

/** Insert an LPN. Generated codes retry on collision; a caller-supplied code does not. */
export async function createUniqueLpn<T extends { code?: string; companyId: unknown }>(
  fields: T
): Promise<InstanceType<typeof Lpn>> {
  const supplied = Boolean(fields.code);
  let code = fields.code ? String(fields.code) : "";
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!supplied || !code) code = await nextLpnCode(String(fields.companyId));
    try {
      return await Lpn.create({ ...fields, code });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      if (supplied) {
        const dup = new Error(`LPN ${code} already exists`);
        (dup as Error & { statusCode?: number }).statusCode = 409;
        throw dup;
      }
      if (attempt === 4) throw err;
      code = "";
    }
  }
  throw new Error("Could not allocate a unique LPN");
}
