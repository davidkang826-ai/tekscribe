export const runtime = "nodejs";

// Address type-ahead. Proxies to Photon (photon.komoot.io), a free
// OpenStreetMap-based geocoder built for autocomplete, so no API key or
// billing is needed. Server-side so we control the request and can swap the
// provider later without touching the client.

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

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      q
    )}&limit=5&lang=en`;
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
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
