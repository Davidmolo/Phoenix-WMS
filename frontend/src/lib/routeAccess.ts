/** Portal customers may only open these in-app paths (plus shipment detail). */

const PORTAL_PATHS = new Set([
  "/dashboard",
  "/inventory",
  "/shipments",
  "/bookings",
  "/requests",
  "/billing",
  "/profile",
]);

function normalizePath(path: string) {
  if (!path || path === "/") return "/dashboard";
  const clean = path.split("?")[0].split("#")[0];
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}

export function gatePath(path: string, role?: string) {
  const p = normalizePath(path);
  if (role === "admin" || role === "staff") return p;
  if (p.startsWith("/shipments/") && p !== "/shipments") return p;
  if (PORTAL_PATHS.has(p)) return p;
  return "/dashboard";
}