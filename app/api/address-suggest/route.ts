export const runtime = "nodejs";

// Address type-ahead. Proxies to Photon, a free OpenStreetMap-based geocoder
// built for autocomplete, so no API key or billing is needed. Server-side so
// we control the request and can swap the provider later without touching the
// client.
//
// Scaling: set PHOTON_URL to a self-hosted or commercial Photon endpoint to
// lift the public instance's rate limits without a code change. A small
// in-memory cache also collapses the repeated lookups a whole team of techs
// typing similar addresses would otherwise send upstream.

const PHOTON_URL = process.env.PHOTON_URL || "https://photon.komoot.io/api/";

// Query (lowercased) -> suggestions, with a short TTL. Per warm serverless
// instance; good enough to absorb bursts and repeated prefixes.
const CACHE = new Map<string, { at: number; suggestions: string[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(key: string): string[] | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.suggestions;
}

function cacheSet(key: string, suggestions: string[]): void {
  if (CACHE.size >= CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), suggestions });
}

type PhotonFeature = {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
};

function label(p: PhotonFeature["properties"]): string {
  const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
  const cityState = [p.city, [p.state, p.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [line1, cityState].filter(Boolean).join(", ");
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ suggestions: [] });

  const cacheKey = q.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return Response.json({ suggestions: cached });

  try {
    const base = PHOTON_URL.includes("?") ? "&" : "?";
    const url = `${PHOTON_URL}${base}q=${encodeURIComponent(q)}&limit=5&lang=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TekScribe/1.0 (address autocomplete)" },
      // Don't let a slow geocoder hang the request.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return Response.json({ suggestions: [] });
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const suggestions = (data.features ?? [])
      .map((f) => label(f.properties))
      .filter((s) => s.length > 4 && !seen.has(s) && seen.add(s))
      .slice(0, 5);
    cacheSet(cacheKey, suggestions);
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
