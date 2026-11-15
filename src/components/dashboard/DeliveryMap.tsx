import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CouriersWithLocation, MapPoint } from '@/types/map'
import { formatDateTime, isLocationFresh, km } from '@/lib/utils'

const courierIcon = (fresh: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:${fresh ? '#178271' : '#8695aa'};border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h4l2 5v6h-2"/><path d="M15 17.5H9"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M5 6h6l4 5.5"/></svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

const pointIcon = (color: string, label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);color:white;font-size:10px;font-weight:700">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13)
      return
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14 })
  }, [map, points])
  return null
}

export default function DeliveryMap({
  pickups = [],
  deliveries = [],
  couriers = [],
  height = 420,
  showPing = false,
}: {
  pickups?: MapPoint[]
  deliveries?: MapPoint[]
  couriers?: CouriersWithLocation[]
  height?: number
  showPing?: boolean
}) {
  const all = useMemo(
    () => [...pickups, ...deliveries, ...couriers.map((c) => ({ lat: c.latitude, lng: c.longitude, label: c.full_name }))],
    [pickups, deliveries, couriers],
  )
  const center: [number, number] = all.length
    ? [all[0].lat, all[0].lng]
    : [-23.5505, -46.6333]

  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl border border-ink-200">
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={all} />

        {pickups.map((p, i) => (
          <Marker key={`p-${i}`} position={[p.lat, p.lng]} icon={pointIcon('#178271', 'C')}>
            <Popup>
              <p className="text-xs font-semibold">Coleta</p>
              <p className="text-xs text-ink-600">{p.label}</p>
            </Popup>
          </Marker>
        ))}

        {deliveries.map((d, i) => (
          <Marker key={`d-${i}`} position={[d.lat, d.lng]} icon={pointIcon('#0d1626', 'D')}>
            <Popup>
              <p className="text-xs font-semibold">Destino</p>
              <p className="text-xs text-ink-600">{d.label}</p>
            </Popup>
          </Marker>
        ))}

        {pickups.map((p, i) => deliveries[i] ? (
          <Polyline
            key={`l-${i}`}
            positions={[[p.lat, p.lng], [deliveries[i].lat, deliveries[i].lng]]}
            pathOptions={{ color: '#178271', weight: 2, dashArray: '5 6', opacity: 0.55 }}
          />
        ) : null)}

        {couriers.map((c) => {
          const fresh = isLocationFresh(c.recordedAt, 3)
          return (
            <Marker key={c.id} position={[c.latitude, c.longitude]} icon={courierIcon(fresh && showPing)}>
              <Popup>
                <p className="text-xs font-semibold">{c.full_name}</p>
                <p className="text-xs text-ink-600">
                  Posição registrada: {formatDateTime(c.recordedAt)}
                </p>
                <p className="text-[11px]" style={{ color: fresh ? '#047857' : '#b45309' }}>
                  {fresh ? 'Atualizada há menos de 3 min' : 'Última posição conhecida'}
                </p>
                {c.distanceToPickupKm != null && (
                  <p className="text-[11px] text-ink-500">{km(c.distanceToPickupKm)} até a coleta</p>
                )}
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
