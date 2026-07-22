export const runtime = "nodejs";

// Address type-ahead. Prefers Google Places (best US residential quality) when
// GOOGLE_PLACES_API_KEY is set, and falls back to Photon (free, OpenStreetMap)
// when it isn't, so the app never regresses while the key is being set up.
// Server-side on purpose: the Google key stays secret and we can swap providers
// without touching the client.
//
// Setup for Google: create an API key in Google Cloud, enable "Places API
// (New)", restrict the key to that API, and set GOOGLE_PLACES_API_KEY. The key
// is used only from this server route, never sent to the browser.

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const PHOTON_URL = process.env.PHOTON_URL || "https://photon.komoot.io/api/";

// Query (lowercased) -> suggestions, with a short TTL. Per warm serverless
// instance; good enough to absorb bursts and repeated prefixes, and it keeps
// Google request volume (and cost) down.
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

// --- Google Places (New) Autocomplete -------------------------------------
type GooglePrediction = {
  placePrediction?: { text?: { text?: string } };
};

async function googleSuggest(q: string): Promise<string[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      // Only return the display text; keeps the response small and the billing
      // on the cheapest autocomplete tier.
      "X-Goog-FieldMask": "suggestions.placePrediction.text.text",
    },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["us"],
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = (await res.json()) as { suggestions?: GooglePrediction[] };
  const seen = new Set<string>();
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction?.text?.text ?? "")
    // Google appends ", USA"; drop it, techs don't need the country.
    .map((s) => s.replace(/,\s*USA$/, "").trim())
    .filter((s) => s.length > 4 && !seen.has(s) && seen.add(s))
    .slice(0, 5);
}

// --- Photon (OpenStreetMap) fallback --------------------------------------
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

function photonLabel(p: PhotonFeature["properties"]): string {
  const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
  const cityState = [p.city, [p.state, p.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [line1, cityState].filter(Boolean).join(", ");
}

async function photonSuggest(q: string): Promise<string[]> {
  const base = PHOTON_URL.includes("?") ? "&" : "?";
  const url = `${PHOTON_URL}${base}q=${encodeURIComponent(q)}&limit=5&lang=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "TekScribe/1.0 (address autocomplete)" },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (data.features ?? [])
    .map((f) => photonLabel(f.properties))
    .filter((s) => s.length > 4 && !seen.has(s) && seen.add(s))
    .slice(0, 5);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ suggestions: [] });

  const cacheKey = q.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return Response.json({ suggestions: cached });

  try {
    const suggestions = GOOGLE_KEY
      ? await googleSuggest(q)
      : await photonSuggest(q);
    cacheSet(cacheKey, suggestions);
    return Response.json({ suggestions });
  } catch {
    // A failed lookup degrades to no suggestions; the field still takes typing.
    return Response.json({ suggestions: [] });
  }
}
