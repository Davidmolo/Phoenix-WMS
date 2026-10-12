import { Router } from "express";
import { requireAuth } from "../middleware/auth";

/**
 * Free address suggestions via OpenStreetMap Nominatim (no API key).
 * Usage policy: identify the app, debounce on the client, keep volume modest.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const router = Router();
router.use(requireAuth);

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "PhoenixWMS/1.0 (phoenixcrossdocks.com; warehouse ops address lookup)";

type NominatimHit = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
};

function formatSuggestion(hit: NominatimHit) {
  const a = hit.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ").trim();
  const city = a.city || a.town || a.village || a.municipality || a.suburb || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  const country = a.country || "";
  const line = [street || hit.display_name, city, state, zip, country]
    .filter(Boolean)
    .join(", ");
  return {
    id: String(hit.place_id ?? `${hit.lat},${hit.lon}`),
    label: hit.display_name || line,
    address: line,
    lat: hit.lat ? Number(hit.lat) : null,
    lon: hit.lon ? Number(hit.lon) : null,
  };
}

router.get("/address-suggest", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) {
      res.json({ suggestions: [] });
      return;
    }

    const params = new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "6",
      // Bias toward US warehouse customers; still returns worldwide results
      countrycodes: String(req.query.country || "us"),
    });

    const upstream = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: `Address lookup unavailable (${upstream.status}). Try typing the address manually.`,
      });
      return;
    }

    const raw = (await upstream.json()) as NominatimHit[];
    const suggestions = (Array.isArray(raw) ? raw : []).map(formatSuggestion);
    res.json({ suggestions, provider: "openstreetmap-nominatim" });
  } catch (err) {
    next(err);
  }
});

export default router;
