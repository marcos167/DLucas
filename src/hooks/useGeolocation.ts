import { useCallback, useEffect, useRef, useState } from 'react'

export interface GeoState {
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'unsupported'
  position: { lat: number; lng: number; accuracy: number } | null
  lastUpdate: number | null
  error: string | null
}

/**
 * Geolocalização real do navegador.
 * Nada é simulado: se a permissão for negada ou o dispositivo não suportar,
 * o estado refleita isso e a interface não exibe posição alguma.
 */
export function useGeolocation(options: { watch: boolean; enabled: boolean }) {
  const [state, setState] = useState<GeoState>({
    status: 'idle', position: null, lastUpdate: null, error: null,
  })
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const requestOnce = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported', position: null, lastUpdate: null, error: 'Dispositivo sem suporte a GPS.' })
      return
    }
    setState((s) => ({ ...s, status: 'requesting', error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({
        status: 'granted',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        lastUpdate: Date.now(),
        error: null,
      }),
      (err) => setState({
        status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
        position: null,
        lastUpdate: null,
        error: err.message,
      }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }, [])

  useEffect(() => {
    if (!options.enabled) { stop(); return }
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported', position: null, lastUpdate: null, error: 'Sem suporte a GPS.' })
      return
    }
    if (options.watch) {
      setState((s) => ({ ...s, status: 'requesting' }))
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => setState({
          status: 'granted',
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
          lastUpdate: Date.now(),
          error: null,
        }),
        (err) => setState((s) => ({
          ...s,
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
          error: err.message,
        })),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
      )
    } else {
      requestOnce()
    }
    return stop
  }, [options.watch, options.enabled, requestOnce, stop])

  return { ...state, requestOnce }
}
