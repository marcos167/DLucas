/**
 * Geocodificação opcional via Nominatim (OpenStreetMap).
 * A plataforma NUNCA inventa coordenadas: se a consulta falhar, os campos
 * permanecem vazios e o endereço é validado pela central no despacho.
 */

export interface GeocodeResult { lat: number; lng: number; displayName: string }
export interface DeliveryAddress {
  delivery_street: string
  delivery_number: string
  delivery_district: string
  delivery_city: string
  delivery_state: string
  delivery_zip_code: string
}
export interface GeocodedDestination { lat: number; lng: number; addressKey: string }

/** Associa a posição ao endereço exato que foi geocodificado, nunca a edições posteriores. */
export function destinationAddressKey(address: DeliveryAddress): string {
  return [
    address.delivery_street, address.delivery_number, address.delivery_district,
    address.delivery_city, address.delivery_state, address.delivery_zip_code,
  ].map((part) => part.trim().toLocaleLowerCase('pt-BR')).join('|')
}

export function destinationForAddress(
  destination: GeocodedDestination | null,
  address: DeliveryAddress,
): GeocodedDestination | null {
  return destination?.addressKey === destinationAddressKey(address) ? destination : null
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const q = query.trim()
  if (q.length < 8) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!res.ok) return null
    const json = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    if (!Array.isArray(json) || !json.length) return null
    const lat = Number(json[0].lat)
    const lng = Number(json[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { lat, lng, displayName: json[0].display_name }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
