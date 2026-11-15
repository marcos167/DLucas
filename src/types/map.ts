export interface MapPoint {
  lat: number
  lng: number
  label: string
}

export interface CouriersWithLocation {
  id: string
  full_name: string
  latitude: number
  longitude: number
  recordedAt: string
  distanceToPickupKm?: number | null
}
