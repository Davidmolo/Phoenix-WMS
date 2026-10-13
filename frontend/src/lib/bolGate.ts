import type { Shipment } from "@/types";

const FOCUS_KEY = "phoenix.focusBol";

export type BolFocusIntent = {
  shipmentId: string;
  /** After landing on shipment detail, offer print (with incomplete confirm). */
  print?: boolean;
  /** Scroll to Bill of Lading section. */
  focus?: boolean;
};

/** Queue navigation intent before `navigate(/shipments/:id)`. */
export function setBolFocusIntent(intent: BolFocusIntent) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(FOCUS_KEY, JSON.stringify({ ...intent, focus: intent.focus !== false }));
}

export function consumeBolFocusIntent(shipmentId: string): BolFocusIntent | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(FOCUS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BolFocusIntent;
    if (parsed.shipmentId !== shipmentId) return null;
    sessionStorage.removeItem(FOCUS_KEY);
    return parsed;
  } catch {
    sessionStorage.removeItem(FOCUS_KEY);
    return null;
  }
}

export type BolCompleteness = {
  incomplete: boolean;
  missing: string[];
};

/** Draft/open BOL missing key capture fields → warn before print / email PDF. */
export function assessBolCompleteness(
  shipment: Pick<Shipment, "carrier" | "trailerNumber" | "weightLbs" | "direction" | "bol"> | null | undefined
): BolCompleteness {
  if (!shipment) return { incomplete: true, missing: ["shipment"] };
  const bol = shipment.bol;
  if (bol?.status === "closed") return { incomplete: false, missing: [] };

  const missing: string[] = [];
  if (!String(bol?.driverName || "").trim()) missing.push("driver name");
  if (!String(bol?.truckNumber || shipment.trailerNumber || "").trim()) {
    missing.push("truck / trailer #");
  }
  if (!String(shipment.carrier || "").trim()) missing.push("carrier");
  if (bol?.countVerified !== true) missing.push("count verified");
  if (bol?.actualCount == null || Number.isNaN(Number(bol.actualCount))) {
    missing.push("actual count");
  }
  if (shipment.direction === "outbound" && !String(bol?.refInboundBol || "").trim()) {
    missing.push("ref inbound BOL #");
  }
  const sigs = bol?.signatures || [];
  const hasDriver = sigs.some((s) => s.role === "driver");
  const hasWh = sigs.some((s) => s.role === "warehouse");
  if (!hasDriver) missing.push("driver signature");
  if (!hasWh) missing.push("warehouse signature");

  return { incomplete: missing.length > 0, missing };
}

/**
 * Shared gate before printing or emailing a BOL PDF.
 * Returns true if the user wants to continue.
 */
export function confirmBolDocumentAction(opts: {
  action: "print" | "email";
  completeness: BolCompleteness;
}): boolean {
  if (typeof window === "undefined") return false;
  if (!opts.completeness.incomplete) return true;

  const verb = opts.action === "print" ? "print" : "email";
  const list =
    opts.completeness.missing.length > 0
      ? `\n\nStill missing:\n• ${opts.completeness.missing.join("\n• ")}`
      : "";

  return window.confirm(
    `Bill of Lading details look incomplete.${list}\n\nDo you want to ${verb} the BOL without filling this information?`
  );
}

export function scrollToBolSection() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("bol-section");
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
