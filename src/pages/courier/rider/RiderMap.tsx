import { useEffect, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed } from 'lucide-react'
import type { MapPoint } from '@/lib/courierDay'
import { cn } from '@/lib/utils'

export interface RiderMapProps {
  points: MapPoint[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * Marcador desenhado em HTML. O mapa é claro mesmo no tema escuro (é assim que
 * as ruas ficam legíveis na rua), então as cores aqui são fixas: verde-escuro
 * do aplicativo, com o escolhido em destaque. O rótulo vem do próprio sistema
 * ("roteiro.parada" ou a letra do tipo), nunca de texto digitado.
 */
function pinIcon(point: MapPoint, selected: boolean): L.DivIcon {
  const size = selected ? 40 : 34
  const fontSize = point.label.length > 3 ? 10.5 : point.label.length > 2 ? 12 : 13
  const dark = '#0e1f19'
  const light = '#f7f5ee'
  const filled = point.kind !== 'pickup'
  const background = selected ? '#bad6be' : filled ? dark : light
  const color = selected || !filled ? dark : light
  const radius = point.kind === 'stop' ? '999px' : '10px'
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius};background:${background};color:${color};border:2px solid ${selected || !filled ? dark : light};box-shadow:0 2px 6px rgba(0,0,0,.35);font:700 ${fontSize}px/1 Inter,system-ui,sans-serif;letter-spacing:-0.02em">${point.label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Enquadra os pontos quando o conjunto muda (não a cada redesenho da tela). */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  const latest = useRef(points)
  latest.current = points
  const signature = points.map((point) => `${point.id}:${point.latitude},${point.longitude}`).join('|')
  useEffect(() => {
    const current = latest.current
    if (current.length === 0) return
    if (current.length === 1) {
      map.setView([current[0].latitude, current[0].longitude], 15)
      return
    }
    const bounds = L.latLngBounds(current.map((point) => [point.latitude, point.longitude] as [number, number]))
    map.fitBounds(bounds.pad(0.2), { maxZoom: 17 })
  }, [map, signature])
  return null
}

/**
 * "Onde estou": mostra a posição do aparelho no mapa quando o entregador pede.
 * A posição fica só nesta tela; não é enviada à central (isso só acontece
 * quando ele autoriza o compartilhamento na tela de uma entrega).
 */
function LocateControl() {
  const map = useMap()
  const box = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<L.LatLng | null>(null)
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle')

  useEffect(() => {
    if (!box.current) return
    L.DomEvent.disableClickPropagation(box.current)
    L.DomEvent.disableScrollPropagation(box.current)
  }, [])

  useEffect(() => {
    const found = (event: L.LocationEvent) => { setPosition(event.latlng); setState('idle') }
    const failed = () => setState('failed')
    map.on('locationfound', found)
    map.on('locationerror', failed)
    return () => {
      map.off('locationfound', found)
      map.off('locationerror', failed)
      map.stopLocate()
    }
  }, [map])

  return (
    <>
      {position && (
        <CircleMarker center={position} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
      )}
      <div ref={box} className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <button
          type="button" aria-label="Mostrar minha posição no mapa"
          onClick={() => { setState('locating'); map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 15_000 }) }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-950 shadow-lift"
        >
          <LocateFixed className={cn('h-5 w-5', state === 'locating' && 'animate-pulse')} />
        </button>
        {state === 'failed' && (
          <p role="status" className="max-w-[13rem] rounded-xl border border-ink-200 bg-white px-3 py-2 text-[12px] leading-snug text-ink-800 shadow-lift">
            Não consegui sua posição. Autorize a localização no aparelho e tente de novo.
          </p>
        )}
      </div>
    </>
  )
}

export default function RiderMap({ points, selectedId, onSelect }: RiderMapProps) {
  const center: [number, number] = points.length ? [points[0].latitude, points[0].longitude] : [-23.5505, -46.6333]
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full !rounded-none">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.map((point) => (
        <Marker
          key={point.id}
          position={[point.latitude, point.longitude]}
          icon={pinIcon(point, point.id === selectedId)}
          zIndexOffset={point.id === selectedId ? 1000 : 0}
          title={point.title} alt={point.title}
          eventHandlers={{ click: () => onSelect(point.id) }}
        />
      ))}
      <LocateControl />
    </MapContainer>
  )
}
