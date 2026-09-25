import { Pallet } from "../models/Pallet";
import { Lpn } from "../models/Lpn";

export async function nextPalletExternalId(companyId: string): Promise<string> {
  const count = await Pallet.countDocuments({ companyId });
  return `PLT-${20001 + count}`;
}

export async function nextLpnCode(companyId: string): Promise<string> {
  const count = await Lpn.countDocuments({ companyId });
  return `LPN-${10001 + count}`;
}
