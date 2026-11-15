/**
 * Geocodificação opcional via Nominatim (OpenStreetMap).
 * A plataforma NUNCA inventa coordenadas: se a consulta falhar, os campos
 * permanecem vazios e o endereço é validado pela central no despacho.
 */

export interface GeocodeResult { lat: number; lng: number; displayName: string }

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const q = query.trim()
  if (q.length < 8) return null
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    if (!json.length) return null
    return {
      lat: Number(json[0].lat),
      lng: Number(json[0].lon),
      displayName: json[0].display_name,
    }
  } catch {
    return null
  }
}
